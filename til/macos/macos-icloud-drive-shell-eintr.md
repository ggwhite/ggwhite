# macOS shell 存取 iCloud Drive 回 EINTR

**日期：** 2026-08-25

## 問題

在 shell（含 Claude Code 的 Bash tool）裡讀 `~/Library/Mobile Documents/com~apple~CloudDocs/` 底下任何東西，全部失敗：

```
$ ls ~/Library/Mobile\ Documents/com~apple~CloudDocs/
ls: ...: Interrupted system call

$ head -c 4 .../某張照片.jpg
head: ...: Interrupted system call
```

Python 也一樣：`InterruptedError: [Errno 4] Interrupted system call`。

看起來很像 iCloud Drive 同步卡死。

## 原因

**是 TCC 權限，不是 iCloud Drive 掛掉。** 跑 shell 的 app 沒有「完整取用磁碟」。

幾個排除掉的錯誤方向，每一個都浪費時間：

- **重試沒用**：30 次重試、60 秒，全數 EINTR
- **`killall bird` 沒用**：bird 重啟後（新 PID）照樣 EINTR
- **不是 sandbox**：Claude Code 關掉 sandbox 一樣失敗
- **`mdfind -onlyin <icloud path>` 也無回應**

診斷時最容易被誤導的一點：**`os.stat()` 會成功**。拿得到 `st_size`、`st_mtime`，看起來檔案好好的。失敗的只有 `readdir()` 和讀檔內容。所以 `[ -d "$path" ]` 這種檢查會通過，`find` 卻炸掉。

另外 `st_blocks` 一律是 0，**已下載和未下載的檔案都是 0**，不能拿來判斷 iCloud 檔案是否已下載到本機。

## 解法

### 判別（一招定生死）

Finder 有 TCC 權限，用它讀同一個路徑。**成功就代表是權限問題，不是 iCloud：**

```bash
osascript -e 'tell application "Finder" to get name of every folder of folder ((path to home folder as text) & "Library:Mobile Documents:com~apple~CloudDocs:某資料夾:")'
```

AppleScript 路徑用**冒號**分隔，不是斜線。

### 永久修法

系統設定 → 隱私權與安全性 → 完整取用磁碟 → 加入該 app。

順便加「輔助使用」，否則 `osascript` 呼叫 System Events 會噴：

```
execution error: System Events發生錯誤：osascript不允許輔助取用。 (-25211)
```

### 繞過（來不及改權限時）

透過 Finder 把檔案複製到本機再處理：

```applescript
set srcFolder to (path to home folder as text) & "Library:Mobile Documents:com~apple~CloudDocs:相簿:20260825:"
set dstFolder to POSIX file "/tmp/staging/20260825" as text
tell application "Finder"
  duplicate (every file of folder srcFolder) to folder dstFolder with replacing
end tell
```

三個坑：

1. **檔案多會部分成功且不報錯**。20+ 個檔案時噴 `AppleEvent 逾時 (-1712)`，實測 22 個檔只複製了 19 個。exit code 不可信，**一定要事後 diff 檔名補齊**。
2. `every file` 會把 `.DS_Store` 和影片一起複製，要自己過濾副檔名。
3. `every file` 不遞迴子資料夾。

### 連帶症狀：Photos.app 匯入卡死

從沒權限的 shell 呼叫 `osascript` 叫 Photos 匯入 iCloud Drive 路徑的照片：

**相簿建立成功，`import` 永久卡住**（跑滿 5 分鐘 timeout，相簿內 0 張）。沒有錯誤訊息，只是不動。

改成匯入本機路徑就秒完成。所以這類 script 只要把「取檔案清單 + 檔案位置」換成本機，其餘 AppleScript 邏輯完全不用改。

## 關鍵洞察

**EINTR 在 iCloud Drive 上不是「暫時性中斷、重試就好」，是權限被擋的偽裝。** 這個 errno 騙人——它讓人以為是 signal 打斷了 syscall，於是本能反應是加重試迴圈，然後浪費幾分鐘確認重試無效。

判斷順序應該是：**先用 Finder 驗證，再談 daemon**。Finder 讀得到就是 TCC，別碰 `bird`、`fileproviderd`。

`stat` 通、`readdir` 不通，是這個問題的指紋。看到這個組合直接跳到 TCC。
