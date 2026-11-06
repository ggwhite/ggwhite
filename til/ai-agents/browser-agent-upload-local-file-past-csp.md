# Browser agent: upload a local file when file_upload fails and CSP blocks localhost

**日期：** 2026-10-30

## 問題
Claude in Chrome 要把本機圖片上傳到 Roblox Creator Hub 縮圖頁：
- `file_upload`（CDP setFileInputFiles）回報成功，但頁面沒反應。
- 直接 `input.files = dt.files` + `change` 事件、合成 `drop` 事件都沒反應。
- 從頁面 `fetch('http://127.0.0.1:...')` 拿檔案 → `TypeError: Failed to fetch`。

## 原因
- 頁面的 CSP `connect-src` 只允許 `*.roblox.com` 等網域，localhost 被擋。
- 上傳按鈕的 handler 是在自己的 click 流程裡建立／讀取 file input，外部塞進去的 `files` 不會被讀到。

## 解法
1. 本機 server（127.0.0.1）提供圖片和一個 `send.html`：同源 fetch 圖片，再 `window.opener.postMessage({name, blob}, 'https://create.roblox.com')`。
   - postMessage 不受 `connect-src` 管；網站沒送 COOP，所以 opener 還在。
2. 在目標頁用 javascript 裝 `message` listener（檢查 `e.origin`），把 Blob 包成 `File` 存起來。
3. 注入一個按鈕，onclick 執行 `window.open('http://127.0.0.1:PORT/send.html')`；用瀏覽器工具的真實點擊（CDP Input）按它，取得 user activation，避開彈出視窗攔截。
4. Patch `HTMLInputElement.prototype.click`：type=file 時不開原生選檔視窗，改成 `this.files = dt.files` 並 dispatch `change`。
5. 用真實點擊按頁面自己的「上傳」按鈕 → 頁面自己的流程收到檔案。
6. 收尾：移除注入的按鈕、停 server、刪 send.html。

## 關鍵洞察
- 先 `curl -sI` 看目標站的 `content-security-policy` 和 `cross-origin-opener-policy`，就知道 fetch 會不會被擋、popup relay 能不能用。
- 當外部設定 `input.files` 沒用時，攔截頁面自己呼叫的 `input.click()`，比模擬事件可靠。
