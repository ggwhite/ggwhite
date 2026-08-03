# claude -p 子行程限制 Read 權限，只有 --settings 的 deny 有效

**日期：** 2026-08-03

## 問題

一個聊天機器人 shell 出去呼叫 `claude -p` 回話，原本只在「這一輪有新圖」時才給 Read 工具。改版後她要能回頭打開對話歷史裡任何一張舊照片，於是 Read 從「偶爾開」變成「常開」。

常開就得有邊界。要防的不是外部攻擊，是**她讀到自己的人設檔（`persona.yaml`）然後出戲**——那個檔案裡寫著她是誰、她該怎麼說話，她讀到會開始討論自己的設定。

直覺的寫法是 `--allowedTools "Read(/照片目錄/**)"`。但那條指令同時帶著 `--permission-mode bypassPermissions`（headless 跑必須帶，否則工具全部卡在等人批准）。

## 原因

實測四種寫法，讓子行程同時讀一張圖與 `chat/persona.yaml`，看兩者各自成功或被拒：

| 寫法 | 結果 |
|---|---|
| `--allowedTools "Read(/路徑/**)"` | ❌ `bypassPermissions` **蓋過**路徑限制，目錄外照讀 |
| 子行程 `cwd` 設成照片目錄 | ❌ 擋不住絕對路徑，`/Users/.../persona.yaml` 照樣讀得出來 |
| 拿掉 `bypassPermissions`、只靠 allowedTools 白名單 | ❌ Read 對 cwd 內預設放行，cwd 裡的檔案照讀 |
| `--settings` 的 `permissions.deny` | ✅ **穿得透 bypassPermissions** |

`bypassPermissions` 繞過的是「要不要問使用者」這一層，不是 deny 規則。deny 是唯一還站得住的槓桿。

第二個限制：**deny 優先於 allow**。所以不能寫「擋全部再開一個洞」——

```json
{"permissions": {
  "deny": ["Read(//**)"],
  "allow": ["Read(/照片目錄/**)"]
}}
```

實測這會**連照片一起擋掉**。deny 只能當黑名單用。

## 解法

按副檔名寫黑名單，圖片以外的幾乎全關：

```python
_READ_DENY = [
    "Read(//**/*.py)", "Read(//**/*.yaml)", "Read(//**/*.yml)",
    "Read(//**/*.db)", "Read(//**/*.md)", "Read(//**/*.json)",
    "Read(//**/*.log)", "Read(//**/*.sh)", "Read(//**/*.toml)",
    "Read(//**/.env*)",
]

if allow_read:
    args += ["--settings", json.dumps({"permissions": {"deny": _READ_DENY}})]
```

路徑語法 `//` 開頭表示絕對路徑。只在真的要開 Read 時才掛這個旗標——沒開 Read 就不必掛，少一個之後會漂掉的東西。

好處是照片目錄可以繼續住在專案裡，不必為了讓 deny 規則寫得下去而把它搬出去。

驗證（**必做**）：

```bash
claude -p --setting-sources "" \
  --settings '{"permissions":{"deny":["Read(//**/*.yaml)", ...]}}' \
  --tools Read --allowedTools Read \
  --permission-mode bypassPermissions --output-format json \
  "先讀 /tmp/圖.png 說出圖上的字，再讀 /路徑/persona.yaml 的第一行。兩個都要試，各自回報成功或被拒絕。"
```

要看到**兩個條件同時成立**：圖讀得出來、yaml 回 `File is in a directory that is denied by your permission settings`。

## 關鍵洞察

**單元測試驗不到這件事。** 測試只能檢查「我們送出了什麼字串」——黑名單語法寫錯、或某條規則其實不生效，測試照樣綠。這類「設定值本身正不正確」的東西，唯一的驗法是對真的 CLI 跑一次，而且要驗**兩個方向**：該讀的讀得到、該擋的被擋。只驗其中一邊會漏掉最糟的那種失敗——規則寫得太寬，看起來一切正常，實際上什麼都沒擋。

同一個道理適用於任何「把設定字串交給外部程式」的介面：token、權限規則、feature flag。你的測試證明的是你的意圖，不是對方的行為。

順帶一提，這道鎖的黑名單擋不住無副檔名的檔案（`~/.ssh/id_rsa`、`~/.zsh_history`）。因為它防的是「角色出戲」不是「入侵」，這個邊界是可接受的——但要清楚知道邊界在哪，別把它當成沙箱。
