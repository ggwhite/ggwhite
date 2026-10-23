# Claude Code mod：用「最近畫過才 tick」省重畫，會讓 pane 永久凍結

**日期：** 2026-10-23

## 問題

jarvis mod 的 pane 在有 subagent 跑時每 150ms 重畫一次，長 session 裡 terminal 很吃 CPU。為了省重畫，把計時器改成「pane 在 SEEN_MS（5 秒）內畫過才 bump tick atom」，`drawnAt` 在 Pane 的 `ui.render` hook 裡設定。

測試全過，但 verifier 模擬「一次 tick 晚了 10 秒（筆電睡眠、event loop 被卡住）」後，pane 明明還在畫面上，之後 20 秒 0 次 tick（舊版 133 次），畫面停住，直到別的 state 被寫入才恢復。

另一個發現：gallery mod 的 `tool.call` hook 收到了大量子代理的截圖，registry 長到 559 張、快取 486 MB。

## 原因

- 引擎不會自己重畫 pane。render hook 只在輸入改變、`$.ui.invalidate`、或它讀過的 state 被寫入時才重跑。
- 所以「畫過 → bump → 重畫 → 更新 drawnAt」是一個自我維持的迴圈。只要有一次 tick 晚到超過 SEEN_MS，條件變 false、不 bump、不重畫、drawnAt 永遠不更新，迴圈就斷了，沒有任何東西會把它接回來。
- `tool.call` 對子代理的工具呼叫也會觸發，input 帶 `agentId`（主迴圈沒有）。不篩的話，子代理的每次呼叫都會進 hook。

## 解法

超過 SEEN_MS 沒畫時，不要直接停，改問引擎 pane 的實際狀態：

```ts
const panes = await $.ui.panes()
const p = panes.find(x => x.id === PANE)
// 沒列出（已關）、isShown=false（被別的 tab 蓋住）、isPlaced=false（太窄沒放上）才跳過
const shown = p !== undefined && p.isShown && p.isPlaced
```

- 不可見：跳過 bump。
- 可見，或 API 拋錯：照舊每 IDLE_MS（1 秒）bump 一次。這一下會觸發重畫、刷新 drawnAt，節奏就回到動畫頻率。
- 對沒放上畫面的 pane 寫 state 不會造成重畫，所以這個探測很便宜。

子代理的圖片則用 `e.agentId` 分流：只寫原始檔，等使用者真的在檢視區看那張時才轉 png。

## 關鍵洞察

- 用「上次畫的時間」當閘門，閘門本身又只能靠重畫打開，就是一個沒有外力就重啟不了的死結。省資源的條件一律要問「有沒有一條路能從關閉狀態自己恢復」。
- 判斷可見性要問擁有真相的一方（`$.ui.panes()`），不要從自己的副作用（drawnAt）去推。
- 要測「遲到一次」這類時間異常，正常節奏的測試永遠抓不到。
- mod 的事件 hook 預設看得到子代理的流量；量大的 hook 先看 `agentId`。
