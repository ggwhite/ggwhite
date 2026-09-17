# instaloader 的 get_posts() 看不到 Reels 分頁

**日期：** 2026-09-17

## 問題

一支同步工具包著 `instaloader`，把公開 IG 帳號的貼文增量抓到本機。某支 Reel 在瀏覽器上看得到，同步工具卻怎麼跑都抓不到，而且每次都回報「成功、0 個新檔」——是**正確地成功**，不是報錯。

工具的核心迴圈只有一行：

```python
for post in profile.get_posts():
    loader.download_post(post, target=account)
```

## 原因

`Profile.get_posts()` 和 `Profile.get_reels()` 打的是**兩個不同的 IG endpoint**，回傳的集合不是包含關係：

| 方法 | GraphQL connection | doc_id | 對應畫面 |
|---|---|---|---|
| `get_posts()` | `xdt_api__v1__feed__user_timeline_graphql_connection` | `7898261790222653` | 個人檔案 grid |
| `get_reels()` | `xdt_api__v1__clips__user__connection_v2` | `7845543455542541` | Reels 分頁 |

IG 發 Reel 時可以勾「不要顯示在個人檔案」。勾了的那些**只活在 Reels 分頁**，timeline 那支 API 根本看不到它們。

實測一個追蹤帳號：`get_reels()` 前 20 筆裡有 **17 筆**是 `get_posts()` 拿不到的，最舊回溯到兩年前。也就是說漏的從來不是一支，是整批。

## 解法

兩條都走，但**各自跑各自的早停計數**：

```python
seen: set[str] = set()
for posts in (profile.get_posts(), profile.get_reels()):
    seen_existing = 0
    for post in posts:
        if post.shortcode in seen:
            continue
        seen.add(post.shortcode)
        if loader.download_post(post, target=account):
            seen_existing = 0
            continue
        seen_existing += 1
        if seen_existing >= PINNED_SLACK:
            break
```

三個細節都是踩過才知道的：

1. **不能串成一條 generator**。寫成 `chain(get_posts(), get_reels())` 的話，第一條觸發 `break` 就永遠輪不到第二條——增量同步的早停條件本來就會在第一條中途成立。
2. **shortcode 去重**。有些 Reel 同時出現在兩邊，重複項會污染「連續幾則已存在」的計數，讓早停提早觸發。
3. **`get_reels()` 每支多一次 API 請求**。它的 `node_wrapper` 是 `Post.from_shortcode(...)`，因為 Reels connection 回的 metadata 不完整。所以這條比 `get_posts()` 貴很多，早停在這裡不是最佳化，是必需品。

## 關鍵洞察

**「成功但結果是空的」比報錯難查，因為它不會叫。** 這個 bug 活了不知道多久，每次同步都回報成功，直到有人拿著一支具體的 URL 問「這部怎麼沒看到」才有辦法定位。

診斷方式也值得記：不要直接改程式碼碰運氣，先寫一支一次性腳本，把 `get_posts()` 和 `get_reels()` 前 N 筆的 shortcode 各印一份，用**那支確定存在的 URL 的 shortcode** 去比對。輸出最後一行直接給結論：

```
結論 → get_posts 有=False  get_reels 有=True
```

三種結果對應三種完全不同的修法（漏 endpoint / 內容根本不屬於這個帳號 / 下載階段被跳過），先分流再動手，比先改再看省一輪。

順帶一個意外收穫：`get_posts()` 的回傳順序**不是時間序**。實測前 20 筆是 `2026-09-07, 2026-06-26, 2026-09-01, 2026-08-24, ..., 2025-03-26` 這種亂序。任何「掃到已下載的就停」的增量邏輯都不能假設它由新到舊排好——要用「連續 N 則都已存在」這種帶寬容度的判準，N 至少要蓋過置頂則數。
