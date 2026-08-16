# detached Popen 讓 PPID=1，看起來像 launchd 拉的

**日期：** 2026-08-17

## 問題

兩個 session 講好共用一台租來的 GPU：A 先跑 6 張、不關機，B 接著跑 16 張、跑完關機。
A 跑完了，B 卻整批失敗：

```
卡住了：425s 沒有新的交件，停在 0/16｜queue=16 out=0 worker=3
不關 5qfzsxgkguv7bv：佇列裡還有 30 個任務
✗ 01-cable-knit-t1-715015197.png  沒有交件
（以下 15 行同）
```

B 只送了 16 個任務，遠端佇列卻有 30 個。ssh 進去看，佇列裡是三批不同前綴的 json，
而 worker 正在畫的那批**誰都沒承認送過**。

## 原因

第一個假設是「另一個 session 插隊」。理由是那批的內容看起來像人做的變體實驗——
32 張同主題、prompt 裡寫著「**這次**她的臉微微低下」。去問，對方否認，並回一條線索：

```
imagegen.gen_daemon  pid 98545  PPID 1  01:08:17 啟動
```

PPID=1 的直覺是「launchd 拉的」，於是我去翻 `launchctl list`——四個 job 都在，
但 `ps -o lstart` 顯示它們是**前一天** 02:25 啟動的，不是剛才。

真正的觸發者在自己的程式碼裡：

```python
# gen_client.py:49
def _ensure_daemon():
    ...
    subprocess.Popen([PYTHON, "-m", "imagegen.gen_daemon"], cwd=REPO_ROOT,
                     start_new_session=True, ...)
```

`start_new_session=True` 的子行程脫離父行程的 session，父行程一結束它就被 init 收養，
**PPID 變成 1**。而 `_ensure_daemon()` 掛在每一次 `upscale()` 呼叫上。

對時間戳：

```
01:08:17  A 的 log：「過了 #771 ... .jpg」→ 開始跑「放大兩倍再匯入相簿」
01:08:17  gen_daemon pid 98545 啟動
```

同一秒。**A 為了補相簿匯入而加的那一行，拉起了本機的產圖 daemon；daemon 一活就看到
有遠端機器可用，把積壓的日常照全部送上去。** 沒有人插隊，插隊的是自己。

B 的逾時判準是「N 秒沒有新交件」，而它分不出「worker 死了」與「worker 在忙別人的」——
worker 一直很忙，只是忙別人的任務。

## 解法

送任務到共用佇列之前先確認佇列是空的，不要只靠「沒有新交件」的逾時：

```python
def depth() -> int:
    r = ssh(ADDR, "ls /workspace/queue/*.json 2>/dev/null | wc -l", check=False)
    return int((r.stdout or "0").strip().split()[0])

while time.time() < deadline:
    if depth() == 0:
        subprocess.run([PY, "-m", "imagegen.boot_queue", "run"])
        break
    time.sleep(25)
```

已經畫好的那 8 張沒有去撿。遠端檔名是流水號（`cb969847-000.png`），要對回原本的
`01-cable-knit-t1-<seed>.png` 只能靠送出順序——**對錯一張，整批判讀就廢了**，
而這批的判準正是「哪一件衣服畫成什麼」。省下的 7 分鐘 GPU（約 $0.05）不值得那個風險。

## 關鍵洞察

**PPID=1 不代表 launchd。** 它只代表「父行程比我早死」。`start_new_session=True`
或任何 detached 啟動都會產生這個現象，而那正是「用的時候才存在」的 daemon 的標準寫法。
看到孤兒行程要先問「誰會呼叫拉起它的那個函式」，再去翻 job 清單。

**查「誰在佔用共用資源」的順序是 pid → 時間戳 → 程式碼，不是產出內容。**
我從 prompt 裡的「這次」推論那是人做的變體實驗，指錯了對象並且發了一封指責信；
那個詞只是產生器的常見措辭。內容像人寫的，不代表是人送的——時間戳只差一秒的兩件事
才是硬證據。

**共用一台機器省下的開機成本，會被第三個使用者吃掉。** 兩個 session 談好了併一次開機
（省 6 分鐘固定成本），但沒有人把「本機 daemon 也會來用」算進去。合併開機的前提是
**佇列的所有生產者都在談判桌上**，而 daemon 不會參加談判。
