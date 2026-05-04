# Docker mutable tag 在多 host 環境會拉到不同 SHA

**日期：** 2026-05-04

## 問題

同一個 docker tag、同一個 image registry repo，在多台 host 上跑 `docker pull` 拉到的 image SHA 不同——某些 host 拿到 broken 版本。

實例（216-xk 容器化 phase 1 UAT 部署）：
- `auth` host pull `134-216-xk-containerize-phase1` 拉到 `1f9c80c6fbcd...` ← 缺 `/srv/gameserver/server.sh`，容器 crashloop
- `game-A` host pull 同 tag 拉到 `50c2d08b2876...` ← 正常運作

```bash
ssh deploy@auth-host  'docker images --format "{{.ID}}" | head -1'
# 1f9c80c6fbcd

ssh deploy@gameA-host 'docker images --format "{{.ID}}" | head -1'
# 50c2d08b2876
```

兩台 host 跑同個 tag 行為卻不一樣。

## 原因

**Mutable tag**（如 `latest`、`release-x.y.z`、`134-216-xk-containerize-phase1`）的本質：tag 是個指標，指向某個 image SHA。當 dev push 新版本時，tag 被重新指向新 SHA，舊 SHA 還在 registry 但 tag 不再指它。

```
時間軸：
  T0: dev push v1（broken），tag 指 SHA_A
  T1: auth host pull → 拿到 SHA_A（broken），本地 cache 住
  T2: dev 發現 broken，push v2（fixed），tag 重指 SHA_B
  T3: gameA host 第一次 pull → 拿到 SHA_B（fixed）
  T4: auth host 沒重新 pull → 還在跑 SHA_A
```

`docker pull <repo>:<tag>` 的行為：
- 如果本地沒有該 tag → 從 registry 拉 tag 當前指向的 SHA
- 如果本地有該 tag → 比對 manifest digest，**digest 變了才重拉**，但需要實際 pull 才會比對（單純 `docker compose up -d` 不會 pull）

所以「之前 pull 過」的 host 會卡在舊 SHA，除非：
- 主動跑 `docker compose pull`
- 或 `docker rmi <tag>` 清掉本地 cache 再 pull

## 解法

### 立即修復（已踩到）

```bash
# 在拉到 broken SHA 的 host 上
docker compose down
docker rmi <repo>:<mutable-tag>
docker compose pull
docker compose up -d

# 驗證 SHA 跟「正常 host」一致
docker images --format '{{.ID}}' | head -1
```

### 長期解法：改用 immutable SHA tag

mutable tag 適合「dev / staging 自動拉最新版」，**prod 多 host 部署絕對不該用**。

CI 推 image 時推兩個 tag：

```bash
# CI script
SHA=$(git rev-parse --short HEAD)
docker tag $IMAGE:build $REGISTRY/$REPO:release-216-xk        # mutable，方便 dev
docker tag $IMAGE:build $REGISTRY/$REPO:release-216-xk-$SHA   # immutable，prod 用
docker push $REGISTRY/$REPO:release-216-xk
docker push $REGISTRY/$REPO:release-216-xk-$SHA
```

OP 部署時 `.env` 寫具體 SHA tag：

```bash
IMAGE_TAG=release-216-xk-abc1234   # 不是 release-216-xk
```

這樣每台 host 拉同 tag 鎖定到同 SHA，不會分歧。

## 關鍵洞察

- **mutable tag 是個指標、不是版本**：你不能假設「同 tag = 同內容」，那只在「同時間點 pull」時才成立
- **多 host 部署時，不同 host 的 pull 時間不同**：第一次 pull 時間差個幾天，可能拉到完全不同的版本
- **`docker compose up -d` 不會自動重 pull**：必須 `docker compose pull` 才會抓最新；如果 image 本地 cache 在，up -d 直接用 cache
- **回滾路徑必須是 SHA**：要回到具體版本必須有 immutable SHA tag，靠 mutable tag 沒辦法精確指版

對應的應用：production 多 host 部署、microservices 多副本、k8s deployment image 也都該用 immutable tag。
