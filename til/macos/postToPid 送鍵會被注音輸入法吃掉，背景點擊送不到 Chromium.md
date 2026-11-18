# postToPid 送鍵會被注音輸入法吃掉，背景點擊送不到 Chromium

**日期：** 2026-11-18

## 問題

macOS CLI 工具用 `CGEvent(...).postToPid(pid)` 對背景的 Edge（Chromium）送數字鍵，替網頁遊戲選卡。時好時壞：有時有效，有時遊戲完全沒反應。另外用 `postToPid` 送滑鼠點擊，網頁按鈕從來沒反應。

## 原因

- **按鍵**：`postToPid` 送出的鍵盤事件仍會經過目前的系統輸入法。使用者的輸入法是注音時，數字鍵 `1` 被輸入法吃掉當成「ㄅ」，網頁收不到 `1`。輸入法是 ABC 時就正常，所以看起來時好時壞。
- **點擊**：背景 Chromium 不處理送到 pid 的滑鼠事件。設定 `kCGMouseEventWindowUnderMousePointer`（field 91、92）為視窗編號也沒用；輔助使用的 `AXPress` 回傳成功，但遊戲沒反應（遊戲聽的是真實的 pointer 事件）。

## 解法

按鍵前暫時切到 ASCII 輸入法，按完切回：

```swift
import Carbon

let original = TISCopyCurrentKeyboardInputSource().takeRetainedValue()
defer { TISSelectInputSource(original) }
TISSelectInputSource(TISCopyCurrentASCIICapableKeyboardLayoutInputSource().takeRetainedValue())
usleep(50_000)
// keyDown / keyUp 用 .privateState 來源 postToPid
```

點擊只有「真的點」有效：暫時把瀏覽器叫到最前面，用 `.cghidEventTap` 點，再用 `CGWarpMouseCursorPosition` 還原游標並切回原本的 App（約 0.3 秒）。

## 關鍵洞察

- 「送給特定 App 的按鍵時好時壞」先看目前輸入法（`TISCopyCurrentKeyboardInputSource`），中文輸入法會攔截。
- Chromium 背景視窗：鍵盤事件 `postToPid` 有效，滑鼠事件無效。
- 輔助使用（`AXManualAccessibility = true` 後走 AX 樹）可以拿到網頁按鈕的精確螢幕位置，比 OCR 讀小按鈕可靠，可以拿來定位再真實點擊。
