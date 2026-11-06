# subprocess 讀 JSON 不能假設 stdout 只有 JSON

**日期：** 2026-07-29

## 問題

一個常駐 bot 要驗收「這張圖裡有沒有人臉」，但影像套件（insightface / onnxruntime）
只裝在另一個專案的 venv 裡。為了不把幾百 MB 的相依樹拖進 bot，走 subprocess：

```python
proc = await asyncio.create_subprocess_exec(
    str(PROBE_PYTHON), "-m", "imagegen.face_probe", path,
    stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE,
)
stdout, stderr = await proc.communicate()
return int(json.loads(stdout.decode())["faces"])   # ← 這裡
```

表現：**每一張需要驗收的圖都被退**，log 全是
`JSONDecodeError: Expecting value: line 1 column 1 (char 0)`。

因為驗收不過的處置是「不送」（出錯就放行會在環境壞掉那天靜默送出沒驗過的臉），
所以失敗的樣子就是整條功能安靜地全滅。**這長得完全像「那個 venv 壞了」**，
於是被當成環境問題寫進待辦、擱置了兩次。

## 原因

手動跑一次那個 probe 就破案了：

```bash
$ ./imagegen/.venv/bin/python -m imagegen.face_probe photo.jpg 2>/dev/null
Applied providers: ['CPUExecutionProvider'], with options: {'CPUExecutionProvider': {}}
find model: /Users/x/.insightface/models/buffalo_l/1k3d68.onnx landmark_3d_68 ...
find model: /Users/x/.insightface/models/buffalo_l/det_10g.onnx detection ...
set det-size: (640, 640)
{"faces": 0}
```

`rc=0`，JSON 也正確——**probe 從來沒壞**。壞的是呼叫端的假設。

insightface 載入模型時用 `print()` 把診斷印出來，而 `print()` 預設寫的是
**stdout**，不是 stderr。所以 stdout 是「一堆診斷 + 最後一行 JSON」，
整包丟給 `json.loads` 必定 raise。

關鍵在於：**這些 print 不是我寫的程式印的，是 import／載模型的副作用。**
自己的 `face_probe.py` 從頭到尾只 print 了一行 JSON，看那份原始碼一百次也找不到問題。

## 解法

在呼叫端防禦，而不是去改被呼叫的那支程式——第三方套件的輸出本來就不可控，
下一版可能多印兩行：

```python
def _parse_faces(stdout: str) -> int:
    for line in reversed(stdout.strip().splitlines()):
        line = line.strip()
        if line.startswith("{"):
            return int(json.loads(line)["faces"])
    raise RuntimeError(f"臉部偵測沒有回傳 JSON：{stdout[-300:]}")
```

兩個細節：

- **反向掃，不是直接取最後一行。** 真正壞掉那天（模型檔不見、OOM）最後一行會是
  別的東西，那時要的是一個看得懂的錯誤訊息，不是 `IndexError`。
- 錯誤訊息帶上 stdout 的尾巴。赤裸的 `JSONDecodeError` 什麼都查不到，
  正是它讓人第一時間往「環境壞了」的方向想。

若那支程式是自己寫的，更治本的做法是讓它把噪音導開：

```python
import contextlib, io, sys
with contextlib.redirect_stdout(sys.stderr):
    model = load_everything()      # 第三方的 print 全部進 stderr
print(json.dumps({"faces": n}))    # 只有這一行是 stdout
```

## 關鍵洞察

**「工具壞了」跟「我讀錯了」在 log 上長得一模一樣，而排除順序應該是後者優先。**

失敗處置若是 fail-closed（出錯就當作沒通過），解析錯誤會表現成整條功能靜默全滅，
跟環境真的壞掉無法區分。這種時候第一件事是**手動跑一次那支子程式**：
rc=0 且輸出正確 → 環境無罪，問題必在呼叫端。這一步只要三十秒，
但前兩次診斷都跳過了它，直接接受了「venv 壞掉」這個看似合理的假設。

推論到通則：**跨語言／跨 venv 用 subprocess 交換 JSON 時，永遠不要假設 stdout 只有 JSON。**
ML 套件（insightface、transformers、onnxruntime）、CLI 工具的 progress bar、
`.bashrc` 印的歡迎訊息，都會混進去。要嘛在來源把 stdout 清乾淨，
要嘛在解析端掃出那一行——但不能什麼都不做。
