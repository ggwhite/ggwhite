# macOS bsdtar 會吃掉 `._*` 條目，`tar -tf | grep` 驗不出 AppleDouble 殘檔

**日期：** 2026-09-11

## 問題

在 macOS 上打交付包給 Linux 維運，對方解開後主機上多出一批 165 bytes 的垃圾檔：

```
/home/deploy/._gameserver
/home/deploy/gameserver/._compose.yml
/home/deploy/gameserver/._.env
/home/deploy/gameserver/scripts/._getList.py
```

`._xxx` 是 macOS 的 AppleDouble：把檔案的 extended attributes（xattr）與 resource fork
存成一個同目錄的伴隨檔。內容無作用，但維運得逐台手動清，而且 `._.env` 這種檔名看起來像
機敏檔，收件方會懷疑交付包本身有問題。

加上 `--exclude` 之後，我想寫一道打包後驗證當守門：

```bash
tar -tzf "$PKG" | grep -E '(^|/)\._' && exit 1
```

跑起來永遠零輸出。看起來很好，但它其實**什麼都沒驗到**。

## 原因

macOS 內建的 `tar` 是 bsdtar（`/usr/bin/tar`，實測 3.5.3 / libarchive 3.7.4）。
它在**讀**歸檔時會把 `._xxx` 條目辨識成對應檔案的 AppleDouble metadata，
**合併進那個檔案的 xattr，不列為獨立條目**。

用 python 造一個含字面 `._a` 條目的 tar 來對照：

```python
import tarfile, io
t = tarfile.open('literal.tar.gz', 'w:gz')
for name, data in [('d/a', b'x'), ('d/._a', b'\x00\x05\x16\x07'), ('d/.DS_Store', b'y')]:
    ti = tarfile.TarInfo(name); ti.size = len(data)
    t.addfile(ti, io.BytesIO(data))
t.close()
```

```
$ /usr/bin/tar -tzf literal.tar.gz
d/a
d/.DS_Store          ← ._a 不見了

$ python3 -c "import tarfile;[print(m.name) for m in tarfile.open('literal.tar.gz')]"
d/a
d/._a                ← 這裡才看得到
d/.DS_Store
```

試過的其他繞法都不行：

- `COPYFILE_DISABLE=1 tar -tzf` → 一樣看不到（這個環境變數只影響寫入）
- `tar --no-mac-metadata -tzf` → `Option --no-mac-metadata is not permitted in mode -t`

所以 `.DS_Store` 抓得到、`._*` 抓不到。守門只擋住一半，而擋不住的那一半正是要擋的東西。

## 解法

**打包三道，缺一不可：**

```bash
# 1. 打包前清 staging 目錄的 xattr 與既有垃圾檔 —— 治本的一步
xattr -cr "$PKG_DIR"
find "$PKG_DIR" \( -name '._*' -o -name '.DS_Store' \) -delete

# 2. 打包時雙保險
COPYFILE_DISABLE=1 tar --exclude '._*' --exclude '.DS_Store' -czf "$PKG" "$DIRNAME"

# 3. 打包後驗證 —— 只能用 python tarfile
BAD=$(python3 -c '
import sys, tarfile
print("\n".join(m.name for m in tarfile.open(sys.argv[1])
                 if m.name.rsplit("/", 1)[-1].startswith("._")
                 or m.name.rsplit("/", 1)[-1] == ".DS_Store"))
' "$PKG")
if [ -n "$BAD" ]; then
  echo "tarball 含 macOS 殘留檔：" >&2; echo "$BAD" >&2
  rm -f "$PKG"; exit 1
fi
```

第 1 步是治本：AppleDouble 的來源是 xattr，不是 tar。macOS 上**每個**檔案都帶
`com.apple.provenance`（`xattr -l <file>` 就看得到），`cp` 會原樣複製到 staging 目錄。
之後只要有任一步把 xattr 序列化——tar 的某些格式、`scp`、Finder 拖到 SFTP／SMB 掛載點
——就會長出 `._` 檔。只做第 2 步的話，換一條傳輸路徑照樣中。

## 關鍵洞察

**用同一個工具家族去驗它自己的輸出，驗不到它自己會隱藏的東西。**

bsdtar 隱藏 `._*` 是刻意設計（讓 macOS 之間 round-trip 時 metadata 不會變成多餘檔案），
但這個貼心正好讓它沒資格當自己的稽核者。要驗一個格式，就換一個不share同樣假設的實作去讀。

推論：**任何「檢查通過」都要先跑對照組**——故意造一個該被擋下的輸入，確認守門真的會叫。
沒跑過對照組的零輸出，跟守門是死碼分不出來。這次如果只看到 `.DS_Store` 被抓到就收工，
會以為整條驗證都好，實際上 `._*` 那半從第一天就是裝飾。
