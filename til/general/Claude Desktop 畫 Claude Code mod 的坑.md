# Claude Desktop 畫 Claude Code mod 的坑

**日期：** 2026-10-15

## 問題

自己寫的 Claude Code mod（jarvis，hooks module＋`ui.render` 畫 pane）在終端機正常，搬到 Claude Desktop（Code 分頁的本機 session）出現三種狀況：

1. 整個 mod 沒載入，`/jarvis` 不存在。
2. 載入後 `/jarvis` 顯示「isn't a command here」。
3. pane 畫得出來，但 Nerd Font 圖示變方框、半格方塊拼的像素圖散成白條。

## 原因

- Desktop 用自己內建的 Claude Code（`~/Library/Application Support/Claude/claude-code/<版本>/`），比終端機舊（當時 2.1.295 vs 2.1.300）。2.1.295 的靜態檢查不允許把 `$` 傳給「從別的檔案 import 的函式」，整個 hooks module 被拒載；命令與工具註冊又包在 try/catch，所以無聲消失。
- Desktop 用戶端會攔下 mod 用 `$.command.register` 註冊的 slash command，不送進 session。
- Desktop 用網頁比例字型與行高畫 Text，終端機那套「字元格拼圖」對不齊；也沒有 Nerd Font。

## 解法

- 診斷：直接跑 Desktop 內建 binary：`<binary> -p hi --output-format stream-json --verbose --debug-file d.log`，看 init 訊息的 `plugins`／`slash_commands`／`tools`，debug log 有 `hooks module X failed to load` 與原因。
- `$` 只傳給同一個檔案宣告的函式；其他檔案只放不收 `$` 的純函式。
- pane 在 `session.start` 自己 `$.ui.open`，不要依賴 slash command。
- `e.surface === 'desktop'` 時改畫 `Svg` 元件（Desktop 有、終端機沒有）：
  - 換算用 `e.props.bodyColumns`：每欄 8pt、每列 19pt（`viewport.columns` 是整個視窗寬，不能用）。
  - 每個 `Svg` 一律給 `width`／`height`；不給時靜態圖會等比放大填滿 pane，`isInteractive` 還多出上下空白。
  - 要動畫就把 SMIL `<animate>` 寫進 SVG 並設 `isInteractive`（沙盒框、無 script）；資料沒變時 SVG 字串要逐字相同，不要讓 tick 進 source。
  - 像素圖每列 rect 高 9.5px 會透出細縫，rect 加 `shape-rendering="crispEdges"`。
  - Nerd Font 私用區字元（U+E000–U+F8FF）在 render 最後一層換成 emoji。

## 關鍵洞察

- mod 的 TSX 裡 JSX factory 叫 `h`：任何含 JSX 的作用域都不能有叫 `h` 的參數或變數，否則執行期丟 `h is not a function`（型別檢查抓不到）。
- `CLAUDE_CODE_PLUGIN_DIR_WATCH=1` 放進 `~/.claude/settings.json` 的 env，Desktop 新開的 session 改檔就會熱重載 mod，調畫面不用一直開新 session。
- Desktop 可以自動化驗收：`open "claude://code/new?folder=<urlencoded>"` 開新 session；剪貼簿＋osascript cmd+v 送 prompt（keystroke 打字會被中文輸入法吃掉）；`screencapture -x -o -l <window id>` 背景截圖。
