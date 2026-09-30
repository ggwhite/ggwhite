# SQLite FTS5 MATCH 的使用者輸入要先包成 phrase

**日期：** 2026-09-30

## 問題

memory-mcp 的搜尋把使用者輸入直接帶進 `WHERE memories_fts MATCH ?`。查詢 `memory-mcp 串連 summary hook` 時回傳：

```
SQL logic error: no such column: mcp (1)
```

其他會出錯的輸入：

- `a:b` → `no such column: a`
- 只有一個 `"` → `unterminated string`
- `(`、`)`、`fn(arg)`、`NOT fish`、`birds OR` → 語法錯誤
- 空字串或只有空白 → 報錯

## 原因

`MATCH` 的右邊不是普通字串，而是 FTS5 的查詢語法。參數綁定（`?`）只能防 SQL injection，不能防 FTS5 語法：

- `-` 會被解析成欄位過濾或排除，所以 `memory-mcp` 被當成「在 `mcp` 欄位裡找」。
- `:` 是欄位過濾（`col:term`）。
- `"` 是 phrase 的開頭和結尾。
- `*` 是前綴比對，`( )` 是分組。
- `AND`、`OR`、`NOT`、`NEAR` 是運算子。

## 解法

把每個 token 都包成 phrase，讓 FTS5 只把它當成要比對的文字：

```go
func ftsQuery(q string) string {
	tokens := strings.Fields(q)
	for i, t := range tokens {
		tokens[i] = `"` + strings.ReplaceAll(t, `"`, `""`) + `"`
	}
	return strings.Join(tokens, " ")
}
```

- `strings.Fields` 依空白切 token，全形空白也算。
- token 裡的 `"` 換成 `""`，這是 FTS5 phrase 內的跳脫方式。
- phrase 之間用空白串接，語意是 AND，跟原本的 bareword 多關鍵字查詢一樣。
- 查詢在 trim 之後是空的，就直接回傳空結果，不要送進 FTS5。

## 關鍵洞察

- 參數綁定不等於跳脫。只要一個字串之後會被另一層語法解析，例如 FTS5、LIKE 的 `%`/`_`、regex，那一層要另外跳脫。
- 用 trigram tokenizer 時，加引號的 phrase 和原本的 bareword 命中結果完全相同，CJK 子字串比對不受影響。
- 少於 3 個字元的 token 在 trigram 下仍然查不到，這是另一個問題，見 [[sqlite-fts5-trigram-cannot-match-two-character-chinese-words]]。
- 來源：memory-mcp `internal/db/search.go` 的 `ftsQuery()`，commit `2c99d5a`。
