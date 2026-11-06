# Plash 桌布長時間播放多支影片卡死變黑，只能整個 Quit 重開救回

**日期：** 2026-07-25

## 問題

用 Plash 把本機 HTML（含多支 muted loop 影片的拍立得桌布動畫）當 macOS 動態桌布用，跑一段時間後（數小時到一兩天）影片會停止播放、凍結。當時嘗試用 Plash 選單的「Reload」重新整理網頁，結果反而讓影片從「凍結但看得到畫面」變成「整個全黑」，且之後不管怎麼 Reload、怎麼改 HTML/JS（強制重繪、監聽 visibilitychange 補畫、調整素材載入順序等）都救不回來，甚至換成 rsync 重抓的乾淨原始檔案還是一樣黑。

## 原因

Plash 是用 WKWebView 把本機網頁渲染成桌面背景。實測排查發現：

1. `document.visibilityState` 在 Plash 裡會週期性在 `visible`/`hidden` 之間切換（跟視窗遮擋判定有關，不一定跟使用者操作對得上，可能是螢幕分享、Space 切換、甚至系統背景活動觸發）。一進入 `hidden`，WebKit 就整個暫停渲染：`requestAnimationFrame` 完全停擺、`setInterval` 被壓到近乎 1Hz。
2. Plash 本身有已知 issue（[sindresorhus/Plash#72](https://github.com/sindresorhus/Plash/issues/72)「Rendering freezes until provoked sometimes」）：內容其實已經在記憶體裡解碼完成，畫面卻沒有被刷新到螢幕，需要外部「戳」一下（例如打開 inspector）才會強制重繪。
3. 最根本問題：長時間持續解碼播放多支影片後，Plash 底層那個 WKWebView 的渲染／視訊解碼資源（GPU process）會耗盡或卡死。這個壞掉的狀態綁在「Plash 這個 App 的渲染程序」上，不是網頁本身——所以單純 Reload（只重新載入網頁內容）完全沒用，因為底層渲染程序沒有被重啟。

## 解法

把 Plash 整個 Quit 掉再重新打開（選單「...」→「Quit Plash」，不是選單裡的「Reload」），會建立一支全新的 WKWebView 渲染程序，才能真正清掉耗盡/卡死的狀態。

## 關鍵洞察

- 診斷「畫面卡住/變黑，但程式邏輯顯示資料已載入成功」這類問題時，要先分清楚是「資料沒載入」還是「載入了但沒被畫出來（渲染/合成器問題）」——後者無論怎麼調整 JS 載入順序、強制重繪，可能都沒用，因為問題出在瀏覽器引擎的渲染管線，不在自己的程式碼。
- WKWebView 型的桌布/常駐渲染 App，長時間播放多支影片是已知容易踩到的資源耗盡陷阱；**單純重新整理網頁 ≠ 重啟渲染程序**，兩者是不同層級的東西，症狀持續不退時要往「重啟整個 App」這個更重的手段去試，不要一直在網頁層級打轉打轉。
- 用 Safari 開同一份 HTML 做差異對照測試（跟 Plash 環境比較），是快速排除「網頁本身邏輯錯誤」的有效方法，能少走很多冤枉路。
