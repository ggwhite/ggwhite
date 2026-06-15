# 首次 Release 踩坑：goreleaser + Tauri + GitHub Actions

**日期：** 2026-06-15

## 問題

用 goreleaser + Tauri 做第一次 v0.1.0 release，CI 連續 fail 了好幾輪，每輪修一個坑。

## 原因與解法

### 1. goreleaser Homebrew publisher 不吃 fine-grained PAT

goreleaser 內部用 GitHub API PUT 推 formula 到 homebrew-tap repo，但 fine-grained token 在這個 endpoint 回 `403 Resource not accessible by integration`。classic PAT 可以，但不想用過寬的 scope。

**解法**：`.goreleaser.yml` 設 `skip_upload: true`，在 `release.yml` 加獨立 step 用 `gh api` 推 formula——`gh` CLI 對 fine-grained token 支援完整。

### 2. Rust crate name 不能數字開頭

Cargo.toml 的 `name = "4x-live"` 在本機沒事（可能是 cached），CI 從 scratch build 時 `cargo metadata` 直接 fail：`invalid character '4' in package name`。

**解法**：改名為 `fourx-live`。binary name 不受影響（Tauri 的 productName 控制）。

### 3. Tauri 2 `Image::from_bytes` 需要 `image-png` feature

tray icon 用 `Image::from_bytes(include_bytes!("tray-icon.png"))` 在 macOS 上能編，因為 macOS app 是 Swift native 不走 Tauri。Linux/Windows 的 Tauri build 缺 `image-png` feature 會 `error[E0599]: no associated function named 'from_bytes'`。

**解法**：`Cargo.toml` 改 `tauri = { version = "2", features = ["tray-icon", "image-png"] }`。

### 4. Windows Tauri build 需要 `icon.ico`

`tauri-build` 的 build.rs 在 Windows 會找 `icons/icon.ico` 來產 Resource file。只放 PNG 就 fail：`` `icons/icon.ico` not found ``。Linux/macOS 不需要所以之前沒發現。

**解法**：用 ImageMagick 從 PNG 轉：`magick icon.png -define icon:auto-resize=256,128,64,48,32,16 icon.ico`。

### 5. CI runner 沒有 git user identity

GitHub Actions runner 沒有全域 git config，測試裡直接跑 `git commit` 會 fail：`Author identity unknown`。本機因為有 `~/.gitconfig` 所以沒事。

**解法**：測試的 git init helper 裡加 `git config user.name test && git config user.email test@test`。

### 6. Re-tag 時 asset already_exists 422

刪掉 tag 重推後 re-run goreleaser，但舊 release 的 assets 還在（release 和 tag 是分開的）。goreleaser 上傳同名 asset 得到 `422 Validation Failed: already_exists`。

**解法**：`gh release delete v0.1.0 --yes --cleanup-tag` 連 release 帶 tag 一起刪乾淨，再重建 tag。

## 關鍵洞察

- 跨平台打包的坑幾乎都是「本機能跑 CI 不行」——本機有全域 config、有 cache、有裝好的 native 工具
- 第一次 release 最好先跑一次 `workflow_dispatch` 測 CI，不要直接推 tag
- goreleaser 和 Tauri 各自文件都很好，但組合起來的邊界案例沒人寫過
