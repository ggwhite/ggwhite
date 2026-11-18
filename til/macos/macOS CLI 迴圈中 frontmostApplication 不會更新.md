# macOS CLI 迴圈中 frontmostApplication 不會更新

**日期：** 2026-11-18

## 問題

Swift 寫的 macOS CLI 工具在 `while true { ...; Thread.sleep(...) }` 迴圈裡每秒讀 `NSWorkspace.shared.frontmostApplication`，判斷遊戲瀏覽器是否在最前面。切到瀏覽器後，工具仍一直回報「不在最前面」。單次執行的測試腳本卻讀得到正確的 App。

## 原因

`frontmostApplication` 不是每次即時查詢，而是靠主 run loop 收 NSWorkspace 通知（`didActivateApplicationNotification`）更新快取。迴圈用 `Thread.sleep` 等待時主 run loop 從不執行，值永遠停在程式啟動當下的 App（通常是終端機）。

## 解法

等待改成跑 run loop：

```swift
RunLoop.current.run(until: Date(timeIntervalSinceNow: interval))
```

## 附帶的坑：Edge 工作區

Edge 工作區（Workspaces）會把視窗標題（`kCGWindowName`）換成工作區名稱，比對不到分頁標題。改用 AppleScript 讀目前分頁：

```applescript
tell application id "com.microsoft.edgemac" to get title of active tab of front window
```

## 關鍵洞察

- AppKit 的狀態類 API（`NSWorkspace`、`NSRunningApplication` 等）在 CLI 裡要有 run loop 才會更新；「一次性測試正常、常駐迴圈失效」就先懷疑這點。
- stdout 導到檔案時是 block buffer，程式被 kill 前記錄可能是空的；除錯時加 `setvbuf(stdout, nil, _IOLBF, 0)`。
