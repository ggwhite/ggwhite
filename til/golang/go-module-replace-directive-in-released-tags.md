# Go Module sub-module 發布時必須移除 replace 指令

**日期：** 2026-06-24

## 問題

`go get github.com/ggwhite/go-masker/zapfield@v0.1.0` 失敗——外部使用者拿到的 `go.mod` 裡有 `replace github.com/ggwhite/go-masker/v3 => ../`，`../` 在別人機器上不存在。

## 原因

開發 monorepo 的 sub-module 時，`go.mod` 通常會加 `replace` 指向本地路徑，讓 IDE 和 `go test` 不用每次都從 proxy 抓主 module：

```
// zapfield/go.mod
require github.com/ggwhite/go-masker/v3 v3.0.0
replace github.com/ggwhite/go-masker/v3 => ../
```

這在本地開發完全正常。但 `replace` 會被打進 git tag——外部使用者 `go get` 時讀到這行，Go 會嘗試解析 `../`，在別人機器上沒有對應目錄，直接報錯。

Go 官方文件有提到 `replace` 只在主 module 生效（被依賴時會被忽略），但實際上 `go get` 一個帶 `replace` 的 module 時**仍然會報錯**，因為此時它就是主 module。

## 解法

發布前的 checklist：

1. 移除所有 sub-module `go.mod` 裡的 `replace` 指令
2. 把 `require` 的版本改為已發布的 tag（例如 `v3.1.0`）
3. 跑 `go mod tidy` 確保 `go.sum` 正確（移除 replace 後會從 proxy 抓，sum 會變）
4. 確認 `go.sum` 有被 git track（slogfield 就因為沒 track go.sum 導致 CI 失敗）
5. 打 tag 並 push

開發時想恢復 replace，可以：
- 手動加回（不 commit）
- 用 `go work`（Go workspace，`go.work` 加 `.gitignore`）

## 關鍵洞察

- `replace` 是開發工具，不是發布工具——它不該出現在任何 release tag 裡
- monorepo 裡多個 sub-module 互相依賴時特別容易踩這個坑，因為沒有 replace 本地開發就很痛苦，久了就忘了 replace 還在
- 比較好的長期方案是用 `go.work`（Go 1.18+），workspace 層級處理 replace，`go.work` 不 commit，sub-module 的 `go.mod` 始終乾淨
