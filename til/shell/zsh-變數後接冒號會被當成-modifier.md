# zsh 變數後接冒號會被當成 modifier

**日期：** 2026-10-23

## 問題

在 zsh 迴圈裡對多條分支跑：

```zsh
git show "$b:rundata/rundata-common/pom.xml" | grep -c RELEASE
```

21 條分支全部回 0，看起來像「沒有命中」，其實每條都有 2～3 個。

## 原因

zsh 的參數展開支援 history modifier：`$var:r`（去副檔名）、`:h`、`:t`、`:e`、`:u`、`:l` 等。
`"$b:rundata/..."` 被解析成 `$b` 套 `:r` modifier，冒號和 `r` 被吃掉，git 收到的是：

```
origin/release/202-zz-至尊undata/rundata-common/pom.xml
```

git show 報錯走 stderr，被 `2>/dev/null` 或 pipe 吞掉，`grep -c` 對空輸入回 0，整條鏈靜默誤報。
bash 沒有這個行為，所以同一段指令在 bash 是對的。

## 解法

變數後面緊接冒號時一律加大括號：

```zsh
git show "${b}:rundata/rundata-common/pom.xml"
```

## 關鍵洞察

- `git show <ref>:<path>`、`scp host:path`、`user:pass` 這類「變數＋冒號」的寫法在 zsh 都會踩到，只要冒號後第一個字母剛好是 modifier（r/h/t/e/u/l/a/A/q/Q…）。
- 「全部回 0」比「部分回 0」更可疑：先拿一條手動驗證，對照組不一致就是工具鏈的問題。
