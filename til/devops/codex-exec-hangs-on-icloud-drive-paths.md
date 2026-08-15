# codex exec 在 iCloud Drive 路徑下讀寫檔會卡死

**日期：** 2026-08-15

## 問題

把專案資料夾搬到 macOS iCloud Drive（`~/Library/Mobile Documents/com~apple~CloudDocs/...`）之後，`codex exec` 內建的 `image_gen` 工具在該路徑下工作時會卡死：process 存活、CPU 幾乎不動（10分鐘只增加零點幾秒），長時間不產出任何檔案，最後以 exit code 1 結束但沒有任何錯誤訊息。

同一台機器對同一個路徑，用 plain `cp` 或編輯器/harness 的 Write 工具寫入完全正常、瞬間完成。只有 `codex exec` 這種會 spawn 子行程、且過程中要讀寫多個中間檔案的流程（讀 prompt 規劃檔 → 呼叫 image_gen 產生暫存圖到 `~/.codex/generated_images/` → 再 `cp` 到目的地）會卡住。

更意外的是：**連只是「讀取」放在 iCloud 路徑下的來源檔案（例如一份 prompt 規劃用的 markdown）都會讓它卡住**，不限於寫入端。

## 原因

推測是 iCloud Drive 的虛擬檔案系統（bird daemon / `brctl` 管理的 on-demand 下載機制）對「子行程反覆開關多個小檔案」這種存取模式處理不良——單次的、簡單的 `cp`/`open`/`write` 沒問題，但 codex 內部一連串的讀取規劃檔、寫入暫存圖、複製到目的地這種多階段 I/O，某個環節卡在等待 iCloud 的檔案佔位/物化（materialization），且沒有 timeout 機制往上拋錯，就這樣一直空轉。

## 解法

不要讓 `codex exec` 直接在 iCloud 路徑下工作：

1. 把來源檔案（prompt 規劃檔等）複製一份到本機非 iCloud 路徑（例如 `/private/tmp` 下的暫存目錄）。
2. `codex exec` 全程在這個本機路徑操作：讀本機的規劃檔副本、輸出也存在本機。
3. 生成完成後，用單純的 `cp` 把成品複製回 iCloud 路徑——這一步不會卡，因為單次簡單 I/O 沒問題。

## 關鍵洞察

- 判斷「是 iCloud 路徑的問題」還是「單純跑很久」的方法：觀察 process 的 CPU 累積時間有沒有隨等待時間增長。真的在算的話 CPU 時間會持續往上跳；卡死的話 CPU 時間幾乎凍結（例如 5 分鐘只多 0.1-0.2 秒），這是最可靠的判斷依據，比只看「有沒有產出檔案」更早能發現問題。
- 這個問題不是 `codex exec` 專屬——任何會 spawn 子行程、走多階段中間檔案 I/O 的 CLI 工具，在 iCloud Drive／類似的虛擬檔案系統路徑下都可能踩到同樣的坑。純粹的單次讀寫（`cp`、一般編輯器存檔、`hyperframes lint`/`render` 這類單一行程的檔案操作）目前沒觀察到問題，不用整個專案都搬回本機，只針對「有子行程+多階段中間檔案」的工具繞開即可。
- 遇到「process 沒死但看起來卡住」時，先用 `ps aux` 抓 CPU 時間變化再決定要不要 kill，比盲目多等或立刻砍掉都更準。
