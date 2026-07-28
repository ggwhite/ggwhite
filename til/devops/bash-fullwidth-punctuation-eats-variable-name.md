# bash 全形標點緊接變數會被吃進變數名，set -u 下讓整個函式靜默不執行

**日期：** 2026-07-28

## 問題

寫給中文使用者看的 shell 腳本，訊息裡混用全形標點是家常便飯：

```bash
log "## 執行後結果（$round，由腳本自動寫入）"
```

這行讓整個 `write_report` 函式**完全沒有執行**。腳本沒有任何錯誤輸出、exit code 也不是 0 以外的值（因為 stderr 被 `2>&1 | grep` 過濾掉了），log 檔停在函式呼叫前的最後一行，看起來就像「函式沒被呼叫」。

第二次踩到才寫成筆記。第一次是 `log "state 檔: $STATE_FILE（已完成的步驟會被跳過）"`，症狀是 `STATE_FILE�: 未綁定的變數`——那次錯誤訊息有露出來，所以只當成單點修掉，沒意識到是通則。

## 原因

bash 的變數名邊界判斷是「非 `[A-Za-z0-9_]` 就停」，**但它對多位元組字元的處理是按 byte 掃描**，全形字元（`，`、`（`、`：`）的 UTF-8 bytes 落在 `0x80-0xFF`，被當成變數名的合法延續。於是：

- `$round，` → 變數名被解析成 `round，`（含全形逗號的 bytes）
- `$STATE_FILE（` → 變數名是 `STATE_FILE（`

這種變數當然不存在。而腳本開頭有：

```bash
set -uo pipefail
```

**`set -u` 遇到未綁定變數會直接終止整個 shell**——這點跟 `set -e` 無關，沒有 `-e` 也一樣會死。所以：

- 錯誤發生在函式內的 `{ ... } >> file` block 裡 → block 中斷
- shell 退出 → 後面的 git commit/push 全部沒跑
- 錯誤訊息只在 stderr → 被管線的 grep 吃掉 → **看起來像什麼都沒發生**

半形標點沒事（`$round,`、`$round)`），所以英文腳本一輩子不會中這個坑。

## 解法

變數後面接任何非 ASCII 字元就用 `${VAR}` 包起來：

```bash
log "## 執行後結果（${round}，由腳本自動寫入）"
```

全檔掃描與自動修正（pattern 是「`$NAME` 後面緊跟非 ASCII」）：

```bash
# 找出所有出問題的行
perl -ne 'print "$.: $_" if /\$[A-Za-z_][A-Za-z_0-9]*[^\x00-\x7F]/' script.sh

# 一次全改成 ${VAR}
perl -i -pe 's/\$([A-Za-z_][A-Za-z_0-9]*)(?=[^\x00-\x7F])/\${$1}/g' script.sh

# 複查（應為空）
perl -ne 'print "$.: $_" if /\$[A-Za-z_][A-Za-z_0-9]*[^\x00-\x7F]/' script.sh
```

修完記得 `bash -n` 驗語法。這個 pattern 適合加進寫完中文 shell 腳本後的例行檢查——我這次順手掃了整個 `scripts/redis-cleanup/`，在另一支已經上線跑過的腳本裡也撈到一個。

## 關鍵洞察

**`set -u` + 管線過濾 stderr = 靜默失敗。** 這個組合讓「未綁定變數」從一個明確的錯誤變成「函式好像沒被呼叫」的幽靈現象。debug 時我一路懷疑函式定義位置、bash 版本的 array 語法、subshell 作用域，繞了三圈才想到去看被我自己 grep 掉的 stderr。

教訓有兩層：

1. **驗證腳本行為時不要過濾 stderr**。要嘛分開存檔（`> out 2> err`），要嘛不要 grep。我當時為了「輸出乾淨」只 grep 關鍵字，等於自己蒙住唯一的線索。
2. **`bash -n` 過不代表會跑**。這是語法檢查，`$round，` 語法完全合法（就是個變數展開），問題在 runtime 才炸。中文腳本要靠上面那個 perl pattern 做靜態檢查，`bash -n` 補不了這個洞。

附帶一個同批抓到的 bug，性質相同（都是「作用域/邊界的直覺錯誤」）：

```bash
{ ...; remaining=(...); ... } | tee -a "$LOG"   # ← 管線讓大括號跑在 subshell
echo "${remaining[*]}"                           # ← 空的
```

`{ ... } | cmd` 的大括號內容在 subshell 執行，裡面賦的值出了管線就消失。要在管線外算好再進去用。
