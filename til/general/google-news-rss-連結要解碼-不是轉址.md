# Google News RSS 連結要解碼，不是轉址

**日期：** 2026-11-03

## 問題

stock-analyzer 從 2026-06 起再也沒抓到任何新聞內文。排程 log 每次都印「完成」：

```
完成：attempted=0 succeeded=0 skipped_junk=0 skipped_blocked=232 skipped_existing=0 failed=0
```

failed=0，看起來像「這些來源本來就該跳過」，五個月沒人發現。AI 一直只拿到標題。

## 原因

1. Google News RSS 的文章連結從 2026-06 起全部變成 `news.google.com/rss/articles/CBMi...`。
2. 這種連結**不是 HTTP 轉址**：`curl -L` 回 200、停在 news.google.com。跟隨 redirect 拿不到原站網址。
3. 爬蟲的封鎖清單有 `news.google.com`（當初是為了擋「轉址頁沒內文」），所以每一筆都被歸到 skipped_blocked。

## 解法

- 用 Google 的 batchexecute API 解碼。Python 套件 `googlenewsdecoder` 的 `gnewsdecoder(url)` 已經包好。
- 先解碼成原站網址，再對**原站網址**做封鎖判斷與抓取。
- 解出的網址寫回 DB，下次不用再解（url 是 PK 的一部分，撞到既有列就刪掉 Google 那筆）。
- 解不出來算 `failed`，不算 `skipped_blocked`。
- 修完 smoke test：attempted=46、succeeded=44。

## 關鍵洞察

- **計數器全部落在「跳過」那一格，要當成失敗看。** 「跳過」是設計給少數例外的，100% 都跳過代表上游格式變了。
- 封鎖清單要擋的是「最終來源」，不是中間層網域；擋中間層等於把上游格式變更變成靜默失敗。
- 區分「解不出來」和「刻意不抓」，failed 才會在 log 裡冒出來。
