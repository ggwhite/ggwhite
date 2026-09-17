# Agent 的 bash 跑在 macOS Background session，讀不到 Keychain

**日期：** 2026-09-17

## 問題

一支用 `browser_cookie3` 從 Edge 撈 cookie 的腳本，**使用者自己在 Terminal 跑得好好的，Claude Code 叫它就一定掛**：

```
browser_cookie3.BrowserCookieError: Unable to get key for cookie decryption
```

訊息指向「解密失敗」，很容易往 cookie 過期、瀏覽器版本、加密格式改版這些方向查——全部都是死路。

## 原因

`browser_cookie3` 在 macOS 上要拿 Safe Storage key，是 fork 一支 `security` 出去問 Keychain：

```python
def _get_osx_keychain_password(osx_key_service, osx_key_user):
    cmd = ['/usr/bin/security', '-q', 'find-generic-password',
           '-w', '-a', osx_key_user, '-s', osx_key_service]
    proc = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    out, err = proc.communicate()
    if proc.returncode != 0:
        return CHROMIUM_DEFAULT_PASSWORD     # ← b'peanuts'
    return out.strip()
```

**授權失敗時它靜默 fallback 成預設密碼 `b'peanuts'`**，然後拿這個假 key 去 AES 解密，當然 MAC check failed。錯誤訊息於是指向解密，而不是指向授權——真正的失敗點被吞掉了。

而授權為什麼失敗：agent 的 bash 跑在 **Background launchd session**，不是 Aqua。Keychain 在非 GUI session 不允許互動授權，直接拒絕。

三行診斷，最後一行是決定性證據：

```bash
launchctl managername
# → Background          （GUI session 會是 Aqua）

security find-generic-password -w -a "Microsoft Edge" -s "Microsoft Edge Safe Storage"
# → exit=36（errSecAuthFailed），而且沒有任何 stderr

security show-keychain-info ~/Library/Keychains/login.keychain-db
# → security: ... User interaction is not allowed.
```

Keychain item 本身存在、ACL 也授權過（使用者在 Terminal 按過「一律允許」），**都不影響結果**——這是 session 層級的限制，不是 ACL 層級的。所以「請使用者先手動授權一次」並不能解決 agent 這邊的問題，我實測授權後再跑還是 `exit=36`。

`dangerouslyDisableSandbox` 也無效，一樣是 Background session。在 agent 對話裡用 `!` 前綴跑也無效，那是同一個 shell。

## 解法

**`osascript` 在 Background session 是可用的**，而 Terminal.app 跑在 Aqua session。讓 Terminal 代跑，輸出寫檔，agent 再讀檔：

```bash
OUT=/tmp/agent-scratch/out.txt
rm -f "$OUT"
osascript -e "tell application \"Terminal\" to do script \"cd ~/proj && ./script.py > $OUT 2>&1; echo __DONE__ >> $OUT\""
```

然後背景等完成（不要用 `tail -f`，它不會自己結束）：

```bash
for i in $(seq 1 1500); do
  if [ -f "$OUT" ] && grep -q __DONE__ "$OUT"; then echo "done after ${i}s"; exit 0; fi
  sleep 1
done
```

`__DONE__` sentinel 是必要的：只看檔案存不存在會在腳本還在寫的時候就誤判完成。

兩個副作用要先跟使用者講：**螢幕上會跳出 Terminal 視窗**，而且第一次可能要批准 Automation 權限。先用 `osascript -e 'tell application "System Events" to count processes'` 探一下通不通，再動手。

另外 instaloader 的進度輸出用 `\r` 不用 `\n`，讀回來的檔案 `wc -l` 會是 0。要先 `tr '\r' '\n'` 再 grep。

## 關鍵洞察

**一個吞掉錯誤、改用 fallback 繼續跑的函式，會把失敗點搬到離現場很遠的地方。** 這裡真正的失敗在 `security` 回 exit 36，但爆炸在 20 行外的 `aes.decrypt_and_verify()`。查這類問題要往回追到「第一個做了 fallback 決定的地方」，不是從爆炸點往外找。

**還有一條更重要的：不要太早宣布「這只能靠使用者手動做」。** 我第一次查完就下了結論說唯一解是使用者自己開 Terminal，還把這個結論存進長期記憶。後來被要求「你去把它弄好」，才發現 `osascript` 這條路一直都在。當下沒試過的可能性，不該寫成「唯一解」。
