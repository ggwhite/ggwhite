# CentOS 搬到 Ubuntu 後 cron 腳本被 dash 靜默打壞

**日期：** 2026-10-02

## 問題

Mongo 過期資料清理的兩支腳本，從 CentOS 裸機搬到 Ubuntu 26.04 docker 機。手動執行測試都成功，但掛進 cron 之後：

- `del_mongo.sh` 完全不會執行。
- 兩支的 log 都是 0 bytes，什麼錯誤都看不到。

## 原因

cron 一律用 `/bin/sh -c` 執行 crontab 的指令。CentOS 的 `/bin/sh` 是 bash，Ubuntu 的 `/bin/sh` 是 **dash**。

1. **沒有 shebang 的腳本會被 dash 執行。** 核心對沒有 `#!` 的檔案回 `ENOEXEC`，呼叫它的 shell 就自己去解讀。在 cron 下這個 shell 是 dash，碰到 bash 才有的 `function f() {` 就報 `Syntax error: "(" unexpected`，整支腳本都不會跑。
   手動測試會成功，是因為人在 bash 互動 shell 裡執行，退回時用的是 bash。
2. **`cmd &>>file` 在 dash 裡的意思不一樣。** dash 會把它解析成 `cmd &`（丟到背景）加上一個沒有指令的 `>>file`，所以輸出不會寫進檔案。連第 1 點的語法錯誤也一起被吃掉了。

## 解法

```bash
# 檢查（都不會真的執行腳本）
dash -n script.sh                                   # 語法在 dash 下過不過
dash -c 'echo hi &>>/tmp/t.log'; stat -c %s /tmp/t.log   # 0 bytes 表示 &>> 沒有生效
```

- 腳本第一行加上 `#!/bin/bash`。
- crontab 的 `&>> file` 改成 `>> file 2>&1`。
- 驗證時要模擬 cron 的方式跑：`/bin/sh -c '/path/script.sh >> log 2>&1'`，不能直接在 bash 裡執行。

## 關鍵洞察

- 「手動測過」不等於「cron 會跑」：兩者的 shell 不同。換 OS 搬 cron 腳本時，要先查 `readlink -f /bin/sh`。
- 有 `#!/bin/bash` 的那支腳本本身會正常跑，因為核心照 shebang 執行；但它的 log 一樣會被 `&>>` 吃掉。
- 這類錯誤不會出現在任何 log 裡，只能靠結果去發現（例如該刪的資料還在）。
