# Claude Code mod 在 herdr 裡畫圖片

**日期：** 2026-10-12

## 問題

寫了一個 Claude Code mod，在對話紀錄裡用 `<Image source={{ file, format: 'png' }} />` 畫縮圖。外層終端機是 cmux（libghostty，支援 kitty graphics），中間隔一層 herdr。直接用 kitty escape 在 herdr pane 送圖片會顯示，但 mod 畫的 `Image` 只出現一行 `[alt]` 文字。

## 原因

- Claude Code 在 herdr pane 裡預設關閉終端機圖片，`Image` 退回畫 `alt`。
- herdr 0.9.1 只轉送讀檔（`t=f`）的 kitty 圖片；直接傳資料（`t=d`）的圖不會畫（herdr #3697），所以 `{ png: base64 }` 來源不能用。

## 解法

`~/.claude/settings.json`：

```json
"env": { "CLAUDE_CODE_FORCE_TERMINAL_IMAGES": "1" }
```

mod 一律用 `{ file, format: 'png' }`，非 PNG 先用 `sips -s format png` 轉檔；工具結果的 base64 圖片用 `$.process.run(['/bin/sh','-c','mkdir -p "$1" && /usr/bin/base64 -D > "$2"','sh',dir,out], { stdin: b64 })` 寫成快取檔（`$.fs.write` 只寫文字）。

## 關鍵洞察

- 驗證有沒有真的畫：`herdr pane read` 的文字快照裡，圖片位置是一段空白列＝有畫；只有一行 `[alt]`＝圖片被關。
- mod 引擎限制：`$` 不能傳進從別的檔案 import 的函式（hooks module 載入失敗），用到 `$` 的程式放在 register.tsx。
- `Read` 圖片的 `ToolResult` output 只有 `{ type: 'image', file: { base64, type } }`，沒有路徑；連續多個 Read 會摺成 `ToolGroup`，不觸發 `ToolResult`，兩個都要 hook。
- focused Pane 的方向鍵被引擎拿去捲動；`Button` 的 `hotkey` 只能是單一數字或小寫字母。
