# 離屏錄製 SwiftUI 動畫要用慢動作

**日期：** 2026-11-11
<!-- slug: smooth-offscreen-swiftui-recording-slow-motion -->

## 問題

macOS app 用離屏視窗（offscreen window，不讓使用者看到）錄 README 動畫：每 1/30 秒用 `NSView.cacheDisplay(in:to:)` 截一張圖，再用 ffmpeg + img2webp 做成 animated webp。播放速度正確，但看起來很卡：實際只有 9–21 fps，最長間隔 266 ms。

## 原因

- 慢的是 `cacheDisplay` 本身，每張 30–190 ms；編碼 TIFF、寫檔加起來只有約 2 ms，所以把它們搬去背景執行緒沒用。
- profile（`sample`）顯示約 40% 時間花在 CPU 高斯模糊（`RIPLayerGaussianBlur` → vImage），來源是 SwiftUI 的 `.shadow(radius:)`。`cacheDisplay` 走 CPU 繪製，不走 GPU。
- 截圖在主執行緒，還會餓死 SwiftUI 自己的動畫影格。
- 換工具也不行：
  - ScreenCaptureKit（`SCStream`）：視窗放在螢幕外時 stream 變 `.suspended`；放在螢幕內但 `alphaValue = 0` 時，每格都是透明空白。只有使用者看得到的視窗才截得到。
  - `CARenderer` 畫 `host.layer` 到 Metal texture：每格 3 ms，但畫面在前幾格後就凍結，看不到 SwiftUI 的 layer 更新。

## 解法

慢動作錄製：截圖慢就讓場景變慢，再把時間戳壓回來。

1. 加一個全域時間倍率 `Motion.timeScale`（app 裡是 1，只有 `--record` 時設成 4）。
2. 所有會動的東西都要吃這個倍率，漏一個就會在影片裡快轉：
   - `withAnimation(...)`、`.animation(_:value:)` → `animation.speed(1 / timeScale)`（包成 `Animation.scaled`）
   - `asyncAfter`、`DispatchWorkItem` 這類延遲 → `seconds * timeScale`
   - `TimelineView` 用的時間 → `date / timeScale`
   - `.symbolEffect(.bounce, options: .speed(1 / timeScale))`
   - 錄製腳本本身的事件時間與打字間隔
3. `times.txt` 寫「場景時間」＝真實經過時間 ÷ timeScale，組 webp 時每格 duration 用相鄰時間差，播放就回到原速。
4. 截圖排程不要用固定 `Timer` 30 fps：某格超時會整格跳過，間隔剛好變 66 ms。改成每 5 ms 檢查、到期就截，最多追一格。

結果：k=3 只有 26 fps；k=4 五個場景都是 30 fps，最長間隔 ≤ 46 ms，總長與舊版差距 < 1%。

## 關鍵洞察

- 先量每一步的時間再改。直覺以為慢在編碼寫檔，實際是 `cacheDisplay` 的 CPU blur。
- 錄不快就讓世界變慢：統一時間倍率比換截圖技術可靠，而且不用螢幕錄製權限、不用顯示視窗。
- 量 webp 的 fps 不能數 frame 數：img2webp（WebPAnimEncoder）會把相同的連續影格合併成一格長 duration，數出來會嚴重低估。要從原始時間戳算。
- 系統元件（`ProgressView` spinner）沒有速度參數，會在慢動作錄影裡快轉 4×，只能錄製時換掉或接受。

## 補充：lossy animated webp 的「雜訊」

慢動作錄好後，畫面上出現零星的暗色方塊，像雜訊。原始 TIFF 是乾淨的，問題在 `img2webp -lossy`：關鍵影格（key frame）之間只重送「變化超過門檻」的區塊，小誤差一格一格累積，靜止畫面就留下過時的方塊。`-exact`、`-sharp_yuv`、`-mixed` 都沒用；縮短關鍵影格間距才有效：`img2webp -kmin 2 -kmax 3 -sharp_yuv -lossy -q 80`，誤差 >24 的像素少 92%，代價是檔案約大 2 倍。
