# instaloader 的 feedback_required 不一定是帳號被擋

**日期：** 2026-11-16
<!-- slug: instaloader-feedback-required-is-per-query -->

## 問題

登入狀態跑 instaloader 4.16 抓 IG，所有帳號都失敗：

- `web/search/topsearch/`（以及 `api/v1/web/search/topsearch/`）回 `404 Not Found`
- 接著 `graphql/query` 回 `400 Bad Request - "fail" status, message "feedback_required"`

`feedback_required` 看起來很像「帳號被 IG 標記成機器人、暫時封鎖」，直覺是等幾小時再試。

## 原因

不是帳號被封，是 IG **只拒絕特定幾支 GraphQL query（doc_id）**：

| 呼叫 | doc_id | 結果 |
|---|---|---|
| `Profile.from_username` | 不打 GraphQL，讀公開個人頁 | OK |
| `Profile._obtain_metadata`（登入時） | `27937681195819736` | 400 feedback_required |
| `get_posts()` 的 timeline 分頁 | `28904005159232689` | OK |
| `get_reels()` | `7845543455542541` | 400 feedback_required |
| `Post.from_shortcode` | `27128499623469141` | OK |

`get_posts()` / `get_reels()` 在登入時都會先呼叫 `_obtain_metadata()`，所以那一支 profile query 被擋，就讓整個帳號看起來全壞。

## 解法

`from_username` 讀的個人頁已經有 `pk` 與 `is_private`，`get_posts()` 只是要這兩個欄位判斷私人帳號。把個人頁 node 標成完整 metadata，跳過被擋的 query：

```python
profile = instaloader.Profile.from_username(context, account)
profile._node = instaloader.Profile._normalize_profile_data(profile._node)
profile._has_full_metadata = True
for post in profile.get_posts():  # 不再打 27937681195819736
    ...
```

代價：拿不到 `friendship_status`，私人帳號判斷會失準；只追公開帳號時沒差。Reels 這條沒有替代 doc_id，只能先停用。

## 關鍵洞察

- `feedback_required` 是**逐 query** 的拒絕，不是帳號層級的封鎖。先逐一探測每個呼叫（`from_username` → `get_posts` → `get_reels`），印出 traceback 中 `doc_id_graphql_query` 的呼叫者，就能分出哪支 query 被擋。
- 用 PEP 723 + uv 跑的腳本，`>=` 版本約束會悄悄升到新版；針對特定版本的 monkey-patch（`if __version__ != "4.15.1": return`）就會無聲失效。出事先看實際載入的版本。
- `cmd | tail` 會吃掉 `cmd` 的 exit code，別拿 `$?` 判斷成敗。
