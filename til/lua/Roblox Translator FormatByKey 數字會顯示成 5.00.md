# Roblox Translator FormatByKey 數字會顯示成 5.00

**日期：** 2026-10-04

## 問題

用 Roblox 內建多國語系（`LocalizationTable` + `Translator:FormatByKey(key, { n = 5 })`）時，Source 是 `"{n} coins"`，結果顯示成 `"5.00 coins"`。

## 原因

`FormatByKey` 的具名參數如果是 Luau number，會照 ICU 數字格式輸出，預設帶兩位小數。

## 解法

格式化前先把數字轉成字串，整數用 `%d`：

```lua
if type(value) == "number" then
	value = if value == math.floor(value) then string.format("%d", value) else tostring(value)
end
```

把這段放在共用的 Text 模組裡，所有呼叫端就不用各自處理。

## 關鍵洞察

- 參數值只做替換，不會重新解析。玩家名字裡有 `{` 或 `}` 也安全。
- 找不到 key 時 `FormatByKey` 會丟錯。要用 `pcall` 包起來，失敗時 warn 並回傳 key，畫面才不會壞掉。
- Studio 測試用的 `Player.LocaleId` 是帳號語言（例如 `zh-tw`）。要測英文，可以用 workspace attribute 覆寫，不必改帳號設定。
- 翻譯字串開頭不要放空白或換行，分隔符號放在程式碼裡，並用測試檢查。
