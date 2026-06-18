# Docker Compose volume mount 空目錄陷阱

**日期：** 2026-06-18

## 問題

old-game-server 容器化後，GM 加減幣回 "invalid token"。`globalvarcfg.lua` 存在於 git repo（`gameserver/config/business/globalvarcfg.lua`），env var `GLOBAL_BITOKEN` 也有設到容器裡，但 Lua runtime 讀不到 `globalvarcfg.bitoken`。

## 原因

三個環節斷裂：

1. `compose.yml` 定義了 volume mount：`./config/business:/srv/gameserver/config/business`
2. **CI deploy job 只推了 `compose.yml` 和 `.env`**，沒推 `config/business/` 目錄的檔案
3. `docker compose up` 發現 host 端 `./config/business` 不存在 → Docker **自動以 root 建空目錄** → 容器拿到空的 mount → `globalvarcfg.lua` 不存在

## 解法

CI deploy job 加一步，用 `tar | docker run alpine tar` 把 git 裡的 `config/business/` 推到 host：

```yaml
# tar pipe 進 docker run 解壓，避免 root ownership 問題
- tar -cf - -C gameserver/config/business . | $SSH $REMOTE "docker run --rm -i -v $TARGET_PATH/config/business:/mnt alpine tar -xf - -C /mnt"
```

用 `docker run` 解壓的原因：Docker 自動建的目錄 owner 是 root，deploy user 沒有 sudo 也無法直接寫入。透過 `docker run` 以 root 身分解壓到 bind mount 目錄繞過 ownership 問題。

踩過的坑：
- `scp -r` 在新版 OpenSSH (SFTP 協定) 對目錄上傳行為不同，會 `stat remote: No such file or directory`
- `sudo chown` 需要免密碼 sudoers 設定，CI runner 沒有

## 關鍵洞察

- **Docker compose 對不存在的 bind mount source 會自動建空目錄（root owned）** — 不報錯、不警告，容器正常啟動但 mount 是空的
- CI/CD pipeline 推檔案時要**確認 compose volume mount 的 source 都有對應的 deploy 步驟**，不能只靠 image bake
- 排查 "config 明明在 git 裡但容器讀不到" 時，先看 compose volumes → 確認 host 端檔案是否存在且有內容
