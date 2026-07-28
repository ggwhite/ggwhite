# SQLite FTS5 trigram 搜不到兩個字的中文詞

**日期：** 2026-07-28

## 問題

一個中文聊天機器人用 FTS5 全文檢索翻歷史對話。表建成這樣：

```sql
CREATE VIRTUAL TABLE messages_fts USING fts5(
    content, content='messages', content_rowid='id', tokenize='trigram'
);
```

觸發器正常、索引筆數跟主表一致（446 = 446），但實際查詢的結果是：

```
健身房   → 3 筆   ✅
麻糬     → 0 筆   ❌   但 LIKE '%麻糬%' 有 14 筆
兒子     → 0 筆   ❌
小孩     → 0 筆   ❌   LIKE 有 30 筆
```

**不報錯、不拋例外，就是回空清單**——跟「這件事從來沒被提過」長得一模一樣。

## 原因

`trigram` tokenizer 索引的是**三字元序列**。少於三個字元的查詢在索引裡沒有任何對應的 token，所以**永遠**比對不到東西。這是 trigram 的定義，不是 bug。

問題出在拿它搜中文：**中文的詞大多是兩個字**。

把那個資料庫的訊息切出最常出現的 40 個中文詞來看，**一半是兩個字**：

```
晚安 好啦 哈哈 嗯嗯 小孩 而已 一下 愛你 寶貝 對啊 什麼 東西 ...
```

全部搜不到。也就是說這個檢索工具對多數真實查詢是**靜默失效**的。

同一支函式還有第二個 bug——把整個查詢字串（含空白）包成一個 phrase：

```python
def _phrase_query(query):
    return '"' + query.replace('"', '""') + '"'
```

於是「麻糬 貓」變成要求這六個字元**連續出現**，就算兩個詞都在同一句裡也必定落空。

## 解法

短詞退回 `LIKE`，多詞逐詞 AND：

```python
MIN_TRIGRAM_LENGTH = 3

def search_history(conn, query, limit=10):
    terms = query.split()
    if not terms:
        return []

    if all(len(t) >= MIN_TRIGRAM_LENGTH for t in terms):
        match = " AND ".join(f'"{t.replace(chr(34), chr(34)*2)}"' for t in terms)
        rows = conn.execute(
            "SELECT m.id, m.role, m.content, m.created_at "
            "FROM messages_fts f JOIN messages m ON m.id = f.rowid "
            "WHERE messages_fts MATCH ? ORDER BY m.id DESC LIMIT ?",
            (match, limit),
        ).fetchall()
        return [dict(r) for r in rows]

    where = " AND ".join("content LIKE ? ESCAPE '\\'" for _ in terms)
    rows = conn.execute(
        f"SELECT id, role, content, created_at FROM messages WHERE {where} "
        "ORDER BY id DESC LIMIT ?",
        (*(f"%{escape(t)}%" for t in terms), limit),
    ).fetchall()
    return [dict(r) for r in rows]
```

三個判斷：

- **掃全表可以接受**。幾百到幾十萬列的 `LIKE '%x%'` 實測 0.1–0.8ms，而它省掉的是一次幾十秒的模型呼叫。為了理論上的索引純度讓功能失效，划不來。
- **`LIKE` 的萬用字元要跳脫**（`%` `_` `\`），配 `ESCAPE '\'`。使用者輸入的 `100%` 不該變成萬用比對。
- **兩條路排序要一致**。這裡兩邊都用 `ORDER BY id DESC` 而不是 `rank`：bm25 拿來排幾百則長度相仿的聊天訊息接近噪音，而「上次講到 X 是什麼時候」要的就是最近那一次。更重要的是，如果 FTS 走 rank、LIKE 走時間，就會出現「查兩個字跟查三個字順序不一樣」這種只在事後才發現的落差。

## 關鍵洞察

**測試資料剛好避開邊界，比沒有測試更危險。**

這個功能有四個測試，全都通過：

```python
search_history(conn, "去爬山")    # 3 字
search_history(conn, "一隻貓")    # 3 字
```

四個查詢**全部剛好是三個字**。不是有人刻意挑的，是「隨手想一個詞」自然就會寫出三個字的詞。測試綠燈、程式碼看起來合理、註解甚至還寫著「這是 trigram 的預期行為，不是 bug」——那句話對 tokenizer 是真的，對這個功能是假的。

一般化：**當失效邊界在資料的性質裡（長度、編碼、語言、時區），而不是在程式碼的分支裡，讀程式碼永遠讀不出來。** 只能拿真實資料跑一次，然後看數字。這次是先跑了八個真實查詢、發現 `麻糬` 回 0 筆才追下去的；單看那支函式，它從頭到尾都很正常。

順帶一提，同一天在同一個專案用同樣的手法（拿真實輸入跑一遍純函式）抓到另一個靜默失效：主動訊息的「他還沒回你」時鐘從「最新的訊息」算，而角色一開口，最新的就是她自己——時鐘每次歸零，被晾三天的第九則訊息仍然顯示「過了一個多小時」。也是測試全綠、程式碼合理、行為完全錯誤。
