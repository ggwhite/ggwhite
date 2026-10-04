# Roblox Studio MCP 驗證時的三個坑

**日期：** 2026-10-04

## 問題

用 Roblox Studio MCP（`execute_luau`、`user_mouse_input`）在 Play 中驗證遊戲行為時，遇到三種「看起來是程式壞了，其實是工具」的情況：

1. 在 `execute_luau`（Server）裡 `require(ServerScriptService.Server.ShopService)` 想讀玩家進度，拿到的資料是 nil。
2. 在 Client 的 `execute_luau` 裡設 `workspace.CurrentCamera.CFrame`，0.3 秒內就被蓋回原本角度，量不到「傳送後鏡頭轉到角色背後」的效果。
3. `user_mouse_input` 用 `instance_path` 點畫面上方的按鈕（分頁、🏆）完全沒反應，同一個工具點左下角的按鈕卻正常。

## 原因

1. `execute_luau` 有自己的 require 快取，require 遊戲的 ModuleScript 會再執行一次模組本體。ShopService 第一次被 require 時會建立並啟動 DataService，所以 Play 中多出一份 DataService，它也會載入玩家、也會在關服時存檔。
2. Client datamodel 執行 `execute_luau` 期間 MCP 會接管鏡頭，結束時還會重設。
3. 設了 `IgnoreGuiInset = true` 的 ScreenGui，元素的 `AbsolutePosition` 是從頂端列（約 58 px）下方開始算，畫面最上方的按鈕 y 會是負值；`instance_path` 依 `AbsolutePosition` 計算點擊位置，結果點到畫面外。

## 解法

1. 不要在 `execute_luau` 裡 require 有副作用的伺服器模組。改用 Client 端 `RemoteFunction:InvokeServer(...)` 或讀 leaderstats、玩家屬性。
2. 鏡頭行為改用 Server 端移動角色（`PivotTo`），然後直接 `screen_capture` 目視。
3. 上方的按鈕改用 computer use 在 Studio 視窗裡點；下方的大按鈕可以繼續用 `user_mouse_input`。

## 關鍵洞察

- MCP 的 `execute_luau` 不是在遊戲腳本的同一個環境裡跑：模組快取、鏡頭都不共用。驗證結果怪怪的時候，先懷疑工具環境，再懷疑程式。
- 同一次除錯裡，金幣 11 被存成 22 的真正原因是另一件事：玩家離開的存檔和關服的 `saveAll` 同時跑、用了同一份舊基準。用 TDD 重現後加了每位玩家的存檔鎖才修好。兩件事同時出現時要分開驗證，不要把錯怪到其中一個上。
