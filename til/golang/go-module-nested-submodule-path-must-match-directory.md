# Go Module 巢狀 sub-module 的 module path 必須對齊目錄結構

**日期：** 2026-06-24

## 問題

`go get github.com/ggwhite/go-masker/v3/zapfield` 失敗，proxy 回 `not found`。主 module `go-masker/v3` 正常，只有 sub-module 抓不到。

## 原因

專案原本的結構是 v3 程式碼放在 `v3/` 子目錄，sub-module 在 `v3/zapfield/`。後來把 v3 搬到 repo root（主 module 的 `go.mod` 放根目錄，靠 `/v3` major version suffix 讓 Go 正確解析），但 `zapfield/` 也跟著搬到了根目錄下。

問題在於 sub-module 的 `go.mod` 仍然宣告 `module github.com/ggwhite/go-masker/v3/zapfield`。Go 解析這個 path 時：

1. 判定 VCS root 是 `github.com/ggwhite/go-masker`
2. 去掉 VCS root 得到子路徑 `v3/zapfield`
3. 在 repo 裡找 `v3/zapfield/go.mod`
4. 該路徑不存在 → `not found`

**關鍵：`/v3` 是 major version suffix，Go 只對「主 module」做特殊處理（把 `/v3` 映射到 repo root）。對 sub-module（巢狀 module）不會做這個處理——Go 直接用去掉 VCS root 後的路徑當目錄去找。**

用 `go mod download -x` 可以看到 Go 實際執行的 git 指令：
```
git cat-file blob <hash>:v3/zapfield/go.mod
```
證實它確實在找 `v3/zapfield/go.mod`。

## 解法

sub-module 的 module path 改成對齊實際目錄結構，移除 `/v3/`：

```
# 改前（壞的）
zapfield/go.mod  → module github.com/ggwhite/go-masker/v3/zapfield
                   Go 去找 v3/zapfield/go.mod → 不存在

# 改後（對的）
zapfield/go.mod  → module github.com/ggwhite/go-masker/zapfield
                   Go 去找 zapfield/go.mod → 存在 ✓
```

改完後打 sub-module tag（`zapfield/v0.1.0`）並 push，proxy 就能抓到了。

## 關鍵洞察

- Go modules 的 major version suffix（`/v3`）是主 module 專屬的語法糖，sub-module 不享有這個待遇
- Sub-module 的 module path **去掉 VCS root 後的部分**就是 Go 要找的目錄路徑，必須一對一
- `go mod download -x` 是 debug 這類問題的利器，能看到 Go 實際在 git repo 裡找什麼路徑
- 搬目錄時容易只改了檔案位置忘了改 `go.mod` 裡的 module path——尤其是 sub-module，因為主 module 用 major version suffix 搬完照樣 work，造成「搬完了」的錯覺
