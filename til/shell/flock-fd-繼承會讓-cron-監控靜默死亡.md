# flock 的 fd 會被子進程繼承，讓 cron 監控靜默死亡

**日期：** 2026-09-12

## 問題

一支用 `flock` 防重疊的 cron 監控腳本，某台機器連續多輪回報「零命中」。
人工用同一套判準手動驗證，卻發現目標明明還在——五個服務全部中標。

外觀上完全正常：cron 有掛、進程有跑過、沒有任何錯誤訊息。
**但它其實已經好幾個小時沒有真的掃過任何東西了。**

骨架長這樣：

```bash
exec 9>"$D/.lock"
flock -n 9 || exit 0          # ← 拿不到鎖就安靜結束

for p in $PORTS; do
  r=$(sh -c "(printf 'probe\n'; sleep 2) | timeout 5 nc 127.0.0.1 $p")
  ...
done
```

## 原因

`exec 9>file` 開的 fd **預設會被 `fork` 出來的子進程繼承**（沒有 `O_CLOEXEC`）。
`sh -c`、`nc`、`socat`、`timeout` 每一個都拿到了 fd 9 的複本。

`flock` 的鎖綁在「開啟檔案描述（open file description）」上，不是綁在進程上。
所以只要**還有任何一個進程持有那個 fd**，鎖就沒放。

於是：

1. 腳本被 kill（我手動 `pkill`，或 SSH 斷線、cron 逾時都一樣）
2. 父進程死了，但 `nc` 子進程還活著、還握著 fd 9
3. 下一輪 cron 起來 → `flock -n 9` 失敗 → `exit 0`
4. **不寫 log、不發告警、不更新基準**，安靜退出
5. 第 5 步永遠重複

最惡劣的地方是第 4 步：`|| exit 0` 是為了「上一輪還沒跑完就跳過這輪」寫的，
完全合理。但它同時也吞掉了「鎖永遠拿不到」這個故障，而且吞得無聲無息。

`ps` 看不出問題（沒有 hookwatch 進程在跑，看起來就是「這輪剛好沒到時間」）。
要用 `fuser` 才看得到真相：

```
$ pgrep -cf hookwatch.sh
0                                    # ← 沒有進程在跑

$ fuser -v /opt/rbwatch/.lock
                     USER   PID  ACCESS COMMAND
/opt/rbwatch/.lock:  root  1838189 F.... bash
                     root  1839142 F.... sh     # ← 殘留的子進程還握著
                     root  1839145 F.... nc
```

## 解法

兩道一起做，缺一不可。

**一、子進程一律關掉那個 fd。** bash 的 `9>&-` 只作用在該指令，不影響腳本自己：

```bash
sh -c "(printf 'probe\n'; sleep 2) | timeout 5 nc 127.0.0.1 $p" 2>/dev/null 9>&-
```

**二、偵測殘留鎖並自我復原。** 取不到鎖時，先確認是不是真的有另一個自己在跑；
不是的話就把 lock 檔換掉：

```bash
exec 9>"$D/.lock"
if ! flock -n 9; then
  if [ "$(pgrep -cf 'hookwatch[.]sh')" -le 1 ]; then   # 只有我自己
    exec 9>&-                    # 先放掉自己的 fd
    rm -f "$D/.lock"             # unlink，之後重建就是新的 inode
    exec 9>"$D/.lock"
    flock -n 9 || exit 0
    echo "$(date '+%F %T') STALE_LOCK_CLEARED" >> "$D/log"   # 留痕跡
  else
    exit 0                       # 真的有人在跑，正常跳過
  fi
fi
```

用「換掉 inode」而不是 `fuser -k`：**本進程自己也開著那個 fd，`fuser -k` 會把自己殺掉。**
`rm` 之後重建是一個新的 inode，殘留者鎖的是舊 inode（已 unlink），擋不到新的。

## 關鍵洞察

**「監控靜默死亡」比「沒裝監控」危險。** 沒裝的話你知道自己沒有覆蓋；
靜默死掉的話你以為有覆蓋，而它每一輪都在跟你說「一切正常」。

推廣到任何 `|| exit 0` 的防重疊寫法：**那行同時吞掉了兩種完全不同的情況**——
「上一輪還在跑」（正常，該跳過）與「鎖永遠拿不到」（故障，該告警）。
它們在程式碼裡長得一模一樣，但後果差了十萬八千里。

自我檢查的問法：**如果這支腳本現在壞掉，我會從哪裡發現？**
如果答案是「log 裡少了幾行」，那就等於不會發現——沒人在盯「少了什麼」。
故障必須是「多出一則告警」，不能是「少了一輪紀錄」。

同一套邏輯適用於任何「安靜跳過」的分支：lock、lease、feature flag、`set -e` 下的
`|| true`。每一個都值得問一次：跳過的原因如果是永久性的，我多久會知道？
