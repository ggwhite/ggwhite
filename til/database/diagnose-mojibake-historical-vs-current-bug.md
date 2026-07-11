# 後台顯示亂碼：先查是不是「歷史髒資料換了新展示層才曝光」而非現行系統新 bug

**日期：** 2026-07-11

## 問題

GM/BI 後台某個查詢頁面的文字欄位（例如「備注」）顯示亂碼，混雜 HTML entity 與亂碼字元（例如 `&auml;&ordm;` 或直接顯示 `ä»¥å¡°` 這類字元）。容易第一時間被當成「這個系統的編碼沒處理好」的新 bug，尤其是剛換了新的前端／新的展示層時。

## 原因

常見成因是舊系統前端 AJAX 提交表單欄位時，`contentType` 沒帶 `charset=UTF-8`，導致 server（如 Spring/Tomcat）用 ISO-8859-1 誤解了 UTF-8 bytes；這批誤解後的字元又經過一層 HTML entity escape 才存進 DB／Mongo，形成「HTML entity + 亂碼字元」混合的多層 mojibake。

如果這個編碼問題早已修復，但修復前寫入的髒資料還留在 DB 裡，換一個新的展示層（例如新做的 Vue 頁面）原樣輸出字串，反而會第一次把這批本來就壞掉的舊資料攤開來看——舊頁面（例如 JSP）可能會把裡面的 HTML entity 直接渲染掉，看起來「怪但不刺眼」，不容易被注意到。

## 解法

1. **先比對亂碼記錄與正常記錄的時間分布**：如果亂碼只集中在特定日期窗口，高機率是歷史髒資料，而不是現行寫入路徑壞掉。
2. **用 git log 找修復 commit 佐證**：
   ```bash
   git log --all --oneline -i --grep="utf-8\|utf8\|編碼\|乱码\|亂碼\|encoding\|charset\|gbk"
   ```
   確認修復時間點，若晚於亂碼資料寫入時間、早於現在，代表現行寫入路徑早就正常了。
3. **還原亂碼內容以佐證推論**（Python）：
   ```python
   import html
   def restore(s: str) -> str:
       unescaped = html.unescape(s)
       raw_bytes = bytes(ord(c) for c in unescaped)  # 逐字元轉 Latin-1 codepoint
       return raw_bytes.decode('utf-8')
   ```
   可以拿同一筆 document 內「乾淨」的伺服器組字前綴（例如 server 自己組的操作描述文字通常是乾淨 UTF-8，只有使用者輸入的那段壞掉）當對照組，驗證只有特定欄位/特定來源壞掉，強化「這是特定 call site 沒轉碼」的判斷。

## 關鍵洞察

- 亂碼只出現在**特定時間窗口**，是「歷史髒資料」的強訊號，不是「現行系統新 bug」。
- **換展示層會讓同一批髒資料呈現方式改變**：原樣輸出字串的新頁面會比會做 HTML entity 渲染的舊頁面更容易讓髒資料「看起來更壞」，但這不代表新系統本身有編碼問題。
- 判斷是歷史資料還是現行 bug 之後，**修復策略完全不同**：現行 bug 要改程式碼；歷史髒資料只能考慮寫一次性 migration 回填，或接受少量歷史記錄的顯示異常。
