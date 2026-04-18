# MongoDB 慢查詢引發簽到 Race Condition

**日期：** 2026-04-18

## 問題

某平台 MongoDB 主機發生 CPU 告警，慢查詢 log 顯示 coinlog、fishlog collection 查詢時間過長（數十秒甚至數分鐘）。

同時發現玩家同一天可以領取多次簽到獎勵。

## 原因

簽到流程如下：

```
查詢玩家簽到狀態 → aggregation sum 查詢 coinlog 當日充值金額 → 金額達標則發獎勵
```

coinlog 為每日自動產生的 collection，沒有自動建立 index 的機制，導致 aggregation 查詢極慢。

前端等待超時後玩家可再次點擊，但後端仍在等待 coinlog 查詢。等查詢完成後，因「查詢簽到狀態」這步已在最前面通過，多個 request 都會進入發獎勵流程，造成重複領獎。

這是一個 **慢查詢 + Race Condition** 疊加的問題。

## 解法

**短期（治標）：**
- 手動在 coinlog 加上 index，查詢效率大幅提升
- 在 Lua server 排程每天自動建立隔日 coinlog 與 fishlog 的 index

**根本問題（尚未處理）：**
- 簽到流程本身存在 Race Condition，查詢快時只是觸發機率低，並非真正修好
- 正確做法是在「發獎勵」步驟加上原子性保護：
  - MongoDB `updateOne` with condition，確保狀態從「未簽到」→「已簽到」只能成功一次
  - 或在 server 層加 Redis distributed lock

## 關鍵洞察

慢查詢不只是效能問題，在有狀態操作的流程中，過長的等待時間會放大 Race Condition 的觸發機率。修慢查詢只是降低了復現率，不是修掉了 bug。

Check-then-act 的操作模式若沒有原子性保護，在任何並發場景下都是潛在問題。
