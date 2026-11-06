# edge-tts 連續呼叫偶爾回傳空音檔（NoAudioReceived），要加重試機制

**日期：** 2026-07-14

## 問題

用 `edge-tts` 套件在同一支腳本裡連續生成多段 TTS（例如逐句念旁白、要合併成一支完整音檔）時，某一段偶爾會拋出 `edge_tts.exceptions.NoAudioReceived: No audio was received.`，導致整個批次中斷。重跑整支腳本，往往會**精準卡在同一個段落**，看起來很像是那段文字或參數有問題。

## 原因

單獨把出錯的那段文字抽出來測試（同樣的 voice/rate/pitch），完全正常生成，證明不是文字內容或參數的問題。實際原因是**連續快速呼叫 Microsoft 的 edge-tts 服務時偶發被限流/丟包**，跟請求順序、時間點有關，不是特定輸入內容導致的必然失敗。

## 解法

在呼叫 `Communicate.save()` 外面包一層重試（帶遞增等待時間），並在每段生成後加一個小延遲降低連續請求頻率：

```python
async def generate_segment(text, voice, rate, pitch, output_path, retries=4):
    for attempt in range(1, retries + 1):
        try:
            comm = edge_tts.Communicate(text, voice, rate=rate, pitch=pitch)
            await comm.save(output_path)
            return
        except edge_tts.exceptions.NoAudioReceived:
            if attempt == retries:
                raise
            print(f"    (no audio, retry {attempt}/{retries}...)")
            await asyncio.sleep(2 * attempt)
```

呼叫端在每次生成後加：

```python
await generate_segment(text, voice, rate, pitch, mp3_path)
await asyncio.sleep(0.5)
```

## 關鍵洞察

遇到「同一個輸入偶發失敗，重跑又卡在同一步」的狀況，先懷疑**外部服務的暫時性問題（限流/丟包）**，不要急著改輸入內容——先把出錯的那段單獨抽出來重跑，如果單獨跑會成功，就代表問題出在呼叫頻率或服務端瞬時狀態，該加的是重試+節流，而不是改參數或改文字去「繞過」一個根本不存在的內容問題。
