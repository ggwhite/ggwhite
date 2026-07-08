# Cobra StringSliceVar 會把 flag 值用逗號切割

**日期：** 2026-07-08

## 問題

4x CLI 的 `4x new --subtask 'x:see https://example.com/a,b page'` 報錯 `subtask format must be "id:name", got "b page"`——值被切成了兩個項目。同一支 flag 更早的坑：`--subtask 'festival-job:節日禮金排程 Job（每日 10:00 checkFestival）'` 的 name 在 `10:00` 處被腰斬，後半段被塞進 description。

## 原因

兩個獨立的切割陷阱疊在同一個 flag 上：

1. **Cobra 的 `StringSliceVar` 用 CSV 語意解析值**——半形逗號會把單一值切成多個 slice 元素，即使整串有 quote 包住（quote 只擋 shell，擋不了 pflag 的 CSV reader）。URL、英文子句都常含逗號。
2. **`strings.SplitN(s, ":", 3)` 三段式解析**——name 本身含冒號（時間 `10:00`、Maven coordinate `group:artifact`、URL）時，第二個冒號後的內容被誤判為 description。

## 解法

1. 自由文字 flag 改用 `StringArrayVar`：repeatable 語意（`--subtask a --subtask b`）不變，但每個值原樣保留、不做逗號切割。`StringSliceVar` 只留給短識別字（ID、repo 名）這種逗號本來就不合法的 flag。
2. 冒號分隔的 `"id:name"` 格式一律 `SplitN(s, ":", 2)`：只認第一個冒號，其餘整段是 name。需要第三個欄位時，不要再疊分隔符——改走別的管道（事後編輯 YAML、JSON 輸入、獨立 flag）。

## 關鍵洞察

- 設計「用符號切割的 CLI 值格式」時，先問：分隔符會不會出現在使用者的正常內容裡？冒號（時間、coordinate、URL）和逗號（URL、英文）幾乎必然出現，不是邊角案例。
- `SplitN` 的 N 永遠取最小需要值——每多一段，就多一個內容含分隔符時被誤切的位置。
- Cobra 選型口訣：值是人寫的句子 → `StringArrayVar`；值是機器識別字 → `StringSliceVar` 才安全。
