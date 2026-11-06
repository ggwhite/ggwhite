# ffmpeg -shortest 會把輸出截到「較短」那條軌，不是「對齊」

**日期：** 2026-08-11

## 問題

hyperframes 影片 render 完後用 ffmpeg 做 grading + 換音軌（`-map 0:v:0 -map 1:a:0 ... -shortest`），成品時長比原始 render 短了好幾秒，結尾卡片（ending-screen 淡入的「CASE CLOSED」畫面）整段消失，觀眾完全看不到。

## 原因

hyperframes composition 的 root duration（GSAP timeline 總長）刻意比旁白音軌長 2-3 秒，多出來的尾段是留給結尾卡片淡入、停留用的（旁白唸完最後一句就結束了，但畫面還要再撐幾秒收尾）。

`-shortest` 的語意是「輸出長度 = 所有輸入串流裡最短的那條」，不是「對齊到某條」。這裡音軌（旁白）比影片短，所以輸出直接被砍到音軌長度，砍掉的正好是音軌結束之後、結尾卡片才要開始淡入的那幾秒——等於結尾卡片還沒登場，片子就先結束了。

實測：EP069 原始 render 60.5s，成品只剩 56.6s（少了 3.9s）；EP070 同樣情況，render 66.2s vs 音軌 63.2s。兩集都用同一份 `post_process.sh` 模板，推測所有用這份模板的集數都中招。

## 解法

拿掉 `-shortest`。不加這個 flag 時，ffmpeg 預設輸出長度 = 最長的那條輸入串流（= 影片長度），音軌在較短的地方自然結束，尾段無聲，不影響播放（反正結尾卡片本來就不需要旁白）。

```bash
# 錯誤：截斷到音軌長度，結尾卡片消失
ffmpeg -y -i "$RENDER_IN" -i "$NAR_FX" \
  -map 0:v:0 -map 1:a:0 \
  -c:v libx264 -crf 18 -c:a aac -shortest \
  "$RENDER_OUT"

# 正確：拿掉 -shortest，保留完整影片長度
ffmpeg -y -i "$RENDER_IN" -i "$NAR_FX" \
  -map 0:v:0 -map 1:a:0 \
  -c:v libx264 -crf 18 -c:a aac \
  "$RENDER_OUT"
```

## 關鍵洞察

`-shortest` 只在「兩條串流理論上應該一樣長、其中一條意外拖尾（例如卡頓的直播錄影）」這種情境下才是對的工具。凡是**設計上**音軌本來就比影片短（片尾卡片、片頭黑場只有畫面沒聲音）的合成場景，`-shortest` 就是會咬掉你故意留白的那一段——先確認兩條串流「應該」一樣長，還是「本來就」不一樣長，再決定要不要加這個 flag。
