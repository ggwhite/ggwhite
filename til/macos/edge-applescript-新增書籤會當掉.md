# Edge AppleScript 新增書籤會讓 Edge 當掉

**日期：** 2026-10-14

## 問題

想用 osascript 把 Microsoft Edge 某個視窗的分頁批次存成書籤再關掉。Edge 的 AppleScript 字典（`sdef "/Applications/Microsoft Edge.app"`）有列出 `bookmark folder`、`bookmark item`、`bookmarks bar`，讀取也正常，但執行 `make new bookmark folder` 時 Edge 直接當掉重啟。

## 原因

crash report（`~/Library/Logs/DiagnosticReports/Microsoft Edge-*.ips`）是 `EXC_BREAKPOINT / SIGTRAP`，stack：

```
Microsoft Edge Framework ChromeMain
Foundation -[NSObject(NSScriptingInternal) _scriptingInsertObjects:atIndexes:inValueForKey:]
Foundation -[NSCreateCommand performDefaultImplementation]
Foundation -[NSScriptingAppleEventHandler handleCommandEvent:withReplyEvent:]
```

Edge 處理 AppleScript `make new`（NSCreateCommand）時觸發內部 CHECK 失敗而自己中止。字典有列出不代表能寫。

## 解法

- 讀取安全：`windows`、`tabs` 的 `id`、`title`、`URL` 都能正常讀。
- 新增書籤不要用 AppleScript。改成產生 Netscape 格式的書籤 HTML，從 `edge://settings/importData` 匯入。
- 當掉後 Edge 重啟會還原視窗，分頁不會掉。

## 關鍵洞察

- 抓背景視窗截圖不必切到前景：用 `CGWindowListCopyWindowInfo` 取得 window number，再 `screencapture -x -o -l <id> out.png`。
- Mac 版 Edge 的瀏覽器工作管理員沒有 `Shift+Esc`（那是 Windows 版），要從選單「視窗 → 工作管理員」開。
