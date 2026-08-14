# codex exec 的 -i 參數會吞掉後面的 prompt，且失敗時 exit code 仍是 0

**日期：** 2026-08-14

## 問題

用 `codex exec` 帶參考圖重新生成圖片時，指令寫成：

```bash
codex exec -s workspace-write --skip-git-repo-check \
  -i img/a.png -i img/b.png \
  "請參考這兩張圖重新生成..."
```

跑完 exit code 是 0，看起來成功，但實際上一張圖都沒有重新生成（目標檔案的內容、mtime 完全沒變）。

## 原因

`-i, --image <FILE>...` 是 clap 的 variadic 參數，會貪婪吃掉後面所有非 flag 的字串，直到遇到下一個已知 flag 為止。所以 `-i img/a.png -i img/b.png "prompt文字"` 這個 prompt 字串被吃進了第二個 `-i` 的檔案列表裡，`codex exec` 真正拿到的位置參數 `PROMPT` 是空的。

`codex exec` 這時的行為是印出 `Reading prompt from stdin... No prompt provided via stdin.`，然後**直接以 exit code 0 結束**——不是把空字串當 prompt 送出，也不是報錯退出，是靜默的假成功。只看 exit code 的呼叫端（例如背景執行、CI）完全看不出來這次跑空了。

## 解法

`PROMPT` 位置參數要放在所有 `-i` **之前**：

```bash
codex exec -s workspace-write --skip-git-repo-check \
  "請參考這兩張圖重新生成..." \
  -i img/a.png -i img/b.png
```

## 關鍵洞察

- variadic flag（`<FILE>...`）出現在指令中間時，後面緊接的位置參數容易被誤吞——這不是 codex 專屬問題，是 clap-based CLI 的通用陷阱，寫多值 flag 時養成「位置參數放最前面，flag 都放最後」的習慣可以整體避開。
- **exit code 0 不代表產出了預期結果。** 呼叫這類會寫檔的 CLI 之後，一定要額外核對「目標檔案是否真的被更新」（比對 mtime / hash / 內容），不能只信任退出碼——這次就是因為背景執行時只看到 `exit code 0` 才多花一輪時間才發現圖片根本沒重生。
