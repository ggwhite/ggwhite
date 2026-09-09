# Redis ZREMRANGEBYRANK 不收縮 dict，判斷要不要瘦身一律看 ZCARD 不看 MEMORY USAGE

**日期：** 2026-09-09

## 問題

一支千萬級的 sorted set 用 `ZREMRANGEBYRANK` 分批刪到只剩 1000 筆之後，
`MEMORY USAGE` 仍然回報 288 MB——合理值應該是 `1000 × ~190 B ≈ 0.2 MB`，差了三個數量級。

一開始我以為是 `MEMORY USAGE` 的抽樣估算誤差，因為好幾個不同的 Redis 實例都回報幾乎一樣的
280–310 MB，看起來像某種「假底」。改用 `MEMORY USAGE <key> SAMPLES 0`（全量精確掃描）
結果一樣，所以不是抽樣的問題。

## 原因

`ZREMRANGEBYRANK` 只刪除成員，**不會收縮 skiplist 底下那個 hash table 的 bucket array**。

Redis 的 sorted set 在 `skiplist` 編碼下由兩部分組成：skiplist（負責排序）與 dict（負責
member→score 的 O(1) 查找）。dict 在成員增加時會 rehash 放大 bucket array，但**刪除成員
不會觸發縮小**——Redis 的 `dictResize` 只在特定條件下被呼叫，逐成員刪除的路徑不走那裡。

算得出來：3,277 萬筆時 bucket array 大約是 `2^25 × 8 B = 268 MB`，加上殘存的 1000 筆資料，
與實測的 288 MB 吻合。

另一個實例的旁證更清楚：某台清完 21 天後有 419,815 筆卻佔 672 MB，等於 **1,600 B/member**；
而同批沒清過的實例是 **172–216 B/member**，差了 8-9 倍。多出來的正好是它 4,220 萬筆時代
留下的 bucket array（`2^26 × 8 B ≈ 537 MB`）。

## 解法

**判斷一支 ZSET 需不需要瘦身，看 `ZCARD`，不要看 `MEMORY USAGE`。**

剛做完 trim 的 key 會顯示幾百 MB 的假底，如果拿這個數字去決策，會誤判成「還很肥、要再清一次」，
而實際上成員早就只剩 1000 筆、再怎麼刪都不會變小。

真的要把那幾百 MB 拿回來，只能 `UNLINK` 整支 key 讓它重建：

```
UNLINK luckywheelrecord
```

代價是最後保留的那 1000 筆一起沒了。對「全服榜單」這種以日均萬筆速率回填的資料，
幾分鐘就補回來，通常划算；對不能重建的資料就別做。

順帶記兩個同批量到的數字，之後估時用：

- **分批刪除的吞吐差異很大**。同樣的 `ZREMRANGEBYRANK` 分批刪，託管 RDS 每百萬筆約 4.2 秒，
  自建主機每百萬筆約 33 秒，**差 7.5 倍**。拿自建主機的實測去估託管環境會高估到離譜。
- `ZREMRANGEBYRANK` 是 deterministic 命令，**replication 傳播的是原命令而不是逐成員的刪除**，
  所以分批刪千萬筆的 replication 流量只有幾百 KB，不會撐爆 repl backlog。
  真正會撐爆 backlog 的是 `HDEL`/`SCAN+DEL` 那種逐項刪除。

## 關鍵洞察

**「容器縮小了」和「容器佔用的記憶體縮小了」是兩件事。**

這個 pattern 不只 Redis 的 dict 有：Go 的 slice `s = s[:0]` 不釋放底層 array、
Java 的 `ArrayList.clear()` 不縮 `elementData`、PostgreSQL 的 `DELETE` 不還磁碟給 OS
（要 `VACUUM FULL`）。**只要是「攤銷成長、不主動收縮」的資料結構，刪除元素之後查它的容量
都會看到舊高水位。**

所以量測時要分清楚問的是哪一個問題：問「還有多少資料」用元素計數（`ZCARD`／`len()`／
`COUNT(*)`），問「佔了多少記憶體」才用容量指標——而且要知道容量指標**不會**因為刪除而下降。
