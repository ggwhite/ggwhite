# Prompt 會長大，寫死的 timeout 遲早被跨過

**日期：** 2026-08-27

## 問題

台股選股專案的每月 AI 分析排程（`stock value-analyze`），從 2026-08-11 起**連續 16 天每天失敗**，錯誤永遠是同一行：

```
分析失敗：claude CLI 逾時（>300s）
[value-analyze-if-due] 失敗 exit=1
```

最後一次成功是 7-13。中間**沒有任何 commit**——程式碼一行都沒改，它就自己壞了。

因為 `--if-due` 的守門條件是「當月尚未產出報告」，失敗後隔天會再試，所以它安靜地每天燒 5 分鐘、連燒半個月，沒有人知道。

## 原因

兩個獨立的坑，第二個是我修第一個時自己踩進去的。

### 坑 1：prompt 隨 DB 資料累積成長，跨過了寫死的 timeout

```python
def run_claude_cli(prompt: str, timeout: int = 300) -> str:
```

量出來 prompt 已經是 **95,757 字元 ≈ 38,300 tokens**（30 檔候選，每檔 3,000~6,500 字元的財報＋新聞＋重大訊息）。opus 吃 38k tokens 再吐結構化 JSON，本來就在 300s 邊緣；而這支流程要跑**兩階段**（分析師選股 → 風險師審查），各一次呼叫。

關鍵在於：**這個專案每小時排程抓新聞和重大訊息，資料只增不減。** 同樣的程式碼，7-13 跑得完，8-11 跑不完——不是誰改壞了，是輸入自己長大了。**任何「把資料庫內容塞進 prompt」的設計，prompt 長度都是單調遞增的函數，寫死的 timeout 只是在等哪一天被跨過。**

雪上加霜的兩件事：

- `run_claude_cli` **完全沒有 retry**，timeout / 非零退出 / 空輸出一律直接 raise
- 分析師跑完（好幾分鐘的成本）之後，**風險師只要掛掉，整份結果就丟掉**

### 坑 2：一份 CSV 同時服務兩個目的

`data/trades.csv` 原本只有個股。我把 ETF 買進紀錄（0050、006208）加進去之後重跑，AI 產出的建議是：

```
買進：1476 儒鴻、3036 文曄、3702 大聯大、1605 華新、2382 廣達
賣出：0050、006208、2451、6903
```

它建議把 ETF 核心部位清掉去換五檔個股。

原因在這支：

```python
def _load_portfolio_holdings() -> list[str]:
    """從 trades.csv 算出目前持股清單（淨張數 > 0 的代號）。"""
    buys, sells = _load_trade_balance()
    return [sid for sid in buys if buys.get(sid, 0) - sells.get(sid, 0) > 0]
```

`trades.csv` 同時扮演兩個角色——**「所有交易的完整帳本」**和**「餵給 AI 的目前持股」**。這兩件事在只有個股的時候剛好等價，加入 ETF 後就分岔了：ETF 是長期核心部位，不參與個股換股評估，但帳本當然要記。

## 解法

### 坑 1

```python
def run_claude_cli(prompt: str, timeout: int = 900, retries: int = 2,
                   budget: float = 2700) -> str:
    started = time.monotonic()
    for attempt in range(retries + 1):
        if attempt:
            elapsed = time.monotonic() - started
            wait = 60 * attempt
            if elapsed + wait + timeout > budget:   # 剩餘預算不夠再試一輪就放棄
                break
            time.sleep(wait)
        try:
            proc = subprocess.run([...], timeout=timeout, ...)
        except subprocess.TimeoutExpired:
            last_err = f"逾時（>{timeout}s）"; continue
        except FileNotFoundError as exc:            # 環境問題，重試無用
            raise AIAnalysisError("找不到 claude CLI") from exc
        ...
```

三個設計決定：

- **`budget` 總時間預算**：排程每小時觸發一次，3 次 × 900s 重試會跨過下一輪。預算用完就放棄，交給隔天排程重跑（`--if-due` 見當月仍無報告會自動再試）。API error 未必馬上重試就會好，不值得在單次執行內糾纏
- **`FileNotFoundError` 不重試**：環境問題重試一百次也一樣
- **風險師失敗降級**，不讓分析師階段的成本歸零：

```python
try:
    risk_raw = runner(risk_prompt)
    risk_result = parse_risk_result(risk_raw)
except AIAnalysisError as exc:
    logger.warning("風險師失敗（%s），降級輸出分析師結果", exc)
    return _tier_picks(..., risk_result=None, ...)
```

降級能成立是因為下游本來就有 guard（`if not ai_result.risk_result:`）——**改成回傳 None 之前先確認消費端接得住，不然只是把爆炸點往後推。**

### 坑 2

台股 ETF 代號一律 `00` 開頭（0050 / 006208 / 0056 / 00878），個股是 1101~9999：

```python
_ETF_PREFIX = "00"

def _load_portfolio_holdings(include_etf: bool = False) -> list[str]:
    ids = [sid for sid in buys if buys.get(sid, 0) - sells.get(sid, 0) > 0]
    if not include_etf:
        ids = [sid for sid in ids if not sid.startswith(_ETF_PREFIX)]
    return ids
```

帳本照樣完整記錄，只是不餵給換股邏輯。

### 順手補上的：成功與失敗都通知

失敗連燒 16 天沒人知道，根因是**它只寫 log，而沒有人會去看 log**。加了 Apple 提醒事項通知（會同步到 iPhone）：

```bash
notify_reminder() {
  local title="$1" body="$2"
  osascript - "$title" "$body" <<'APPLESCRIPT' >> "$LOG" 2>&1
on run argv
  tell application "Reminders"
    if not (exists list "stock") then
      make new list with properties {name:"stock"}
    end if
    make new reminder at list "stock" with properties ¬
      {name:(item 1 of argv), body:(item 2 of argv), due date:(current date)}
  end tell
end run
APPLESCRIPT
}
```

用 `argv` 傳參而不是把字串插進 AppleScript 原始碼——標題或內文含引號時前者不會爆。

通知的判斷條件有個陷阱：`--if-due` 在「未到觸發日」和「當月已跑過」時**也是 exit 0**，只看 exit code 會每天送一則沒意義的成功通知。改用「當月報告檔數有沒有增加」區分真的產出與 noop：

```bash
VA_BEFORE=$(find reports/value -maxdepth 1 -name "${VA_MONTH}-*.html" | wc -l)
run_step "value-analyze-if-due" stock value-analyze --if-due
VA_RC=$?
VA_AFTER=$(find reports/value -maxdepth 1 -name "${VA_MONTH}-*.html" | wc -l)
```

（注意 launchd 跑的 process 需要「提醒事項」存取權，跟終端機 session 的授權不共用。）

## 關鍵洞察

**「沒改程式碼所以不是我弄壞的」是錯的直覺。** 只要系統有單調成長的輸入——DB 累積、日誌堆疊、使用者資料變多——寫死的上限就是一顆定時炸彈。查這種問題要先問「什麼東西一直在長大」，而不是先 `git log` 找兇手。

**同一份資料被兩個目的共用，等價關係破裂時不會報錯，只會靜靜地給出錯誤答案。** `trades.csv` 當帳本和當 AI 輸入，在只有個股時剛好一致；加入 ETF 後分岔了，程式沒有任何異常，只是產出「賣掉核心部位」的荒謬建議。**這種 bug 沒有 stack trace，只能靠看懂輸出才發現**——所以 AI 產出的東西一定要人看過一遍再信。

**每天自動重試的失敗最危險。** 有 retry 反而讓失敗變得無聲：它每天都在試、每天都失敗、每天都沒人知道。**任何會自我重試的排程，都必須有一條把失敗推到人眼前的路徑**，log 不算——沒有人會去看 log。
