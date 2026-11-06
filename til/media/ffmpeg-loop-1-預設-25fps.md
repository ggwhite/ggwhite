# ffmpeg `-loop 1` 的預設輸入幀率是 25，`zoompan` 的 `fps` 救不回來

**日期：** 2026-08-04

## 問題

用 ffmpeg 把一組靜照剪成 30fps 的直式短影片，每一顆鏡頭指定停留秒數（`hold`），
十二顆接起來應該是 30.0 秒。

輸出檔看起來完全正常：能播、`ffprobe` 報 30.0 秒、`concat` 沒有任何警告。

真正的症狀出現在別的地方——**配音跟燒進去的字幕愈走愈開**，收尾三句的聲音比
字幕早半秒出來。

數格數才看到問題：

```sh
ffprobe -v error -count_frames -select_streams v \
  -show_entries stream=nb_read_frames -of csv=p=0 out.mp4
# 885，但 30 秒 × 30fps 該是 900
```

## 原因

**`-loop 1 -i 圖.png` 的預設輸入幀率是 25，不是輸出的 30。**

而濾鏡鏈裡的 `zoompan=...:fps=30` 沒有把它補起來：`fps` 只設定「輸出時間戳用
哪個幀率」，`d=1` 是**一格進一格出**。所以 2.0 秒的輸入只有 50 格，貼上 30fps
的時間戳之後就變成 1.67 秒的鏡頭——短了六分之一。

十二顆裡只有兩顆壞，這是它藏這麼久的原因：**有疊 PNG 字幕圖層的鏡頭剛好被救
回來**。

```
[0:v]crop,scale,zoompan[bg];[bg][1:v]overlay=0:0
```

`overlay` 的 framesync 會把兩路輸入的時間戳取聯集，圖層那一路是完整 2.0 秒，
於是輸出的格數補回 30fps。結果是「有字幕的鏡頭秒數都對、沒字幕的鏡頭短」，
而 `concat` 照樣成功。

## 解法

**每一個 `-i` 前面都要加 `-framerate`**。跟 `-t` 一樣，它是輸入選項，位置決定
它歸誰管：

```python
rate = str(fps)
cmd = ["ffmpeg", "-framerate", rate, "-loop", "1", "-t", hold, "-i", str(src)]
if layer:
    cmd += ["-framerate", rate, "-loop", "1", "-t", hold, "-i", str(layer),
            "-filter_complex", f"[0:v]{chain}[bg];[bg][1:v]overlay=0:0"]
```

測試要**真的剪一段出來數格數**，而且刻意挑**沒有字幕的鏡頭**——那才是會壞的
那條路。拿掉 `-framerate` 這條測試會失敗（50 格 vs 60 格）：

```python
made = reel.build(tmp_path)   # 兩顆 1.0 秒、都沒有字幕
frames = int(subprocess.run(
    ["ffprobe", "-v", "error", "-count_frames", "-select_streams", "v",
     "-show_entries", "stream=nb_read_frames", "-of", "csv=p=0", str(made)],
    capture_output=True, text=True, check=True).stdout)
assert frames == 60
```

## 關鍵洞察

**不要拿 `ffprobe format=duration` 當長度的證據。** 容器長度是被輸出的 `-t`
釘死的，所以它永遠是對的——它報 30.0 秒的時候，影像串流可能只有 29.5 秒。
唯一問得到真話的是格數。

這又是同一個形狀：**失敗的樣子跟成功的樣子一模一樣**。檔案能播、時間對、
沒有錯誤訊息，而錯的東西是「聲音跟畫面對不上」這種只有人看得出來的事。

同一天同一個 repo 的其他三次：`cmd | tail` 讓 exit code 變成 `tail` 的、
OOM kill 不留訊息、macOS 沒有 `timeout` 而 `|| true` 把它洗成成功。

治法都一樣：**不要看 exit code、不要看摘要欄位，去數那件事該產生的東西。**
