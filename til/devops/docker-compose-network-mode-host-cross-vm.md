# docker compose 跨 VM 部署 cluster RPC 必須用 network_mode: host

**日期：** 2026-05-04

## 問題

把舊有 cluster framework（skynet / akka / erlang OTP / Elixir cluster）從裸機部署改成 docker compose multi-VM 部署時，**跨 host 的 cluster RPC 完全不通**。

實例（216-xk 容器化 phase 1）：
- 裸機原本 8 台 VM 跑 skynet svrd，cluster 互通 OK
- 改成 docker compose 各 VM 跑容器後，gateA host 的 svrd 連不到 gameB host 的 svrd
- host 端 `netstat -ntlp` 看不到任何 cluster port listen

```bash
# room host 上
$ docker ps
old-game-server-room  Up 36 hours (unhealthy)  8081/tcp, 8889/tcp, 9888/tcp
                                               ^^^ 注意：沒有 0.0.0.0:->，純 EXPOSE 沒 publish

$ netstat -ntlp
# 完全沒看到 9141 / 9171 / 9241 等 cluster port
```

## 原因

docker 預設 **bridge network mode**，容器在 docker0 虛擬橋接器內 listen，跟 host 網路隔離。

```
host network namespace
  ├─ eth0 (192.168.16.233) ← cluster RPC 該走這
  └─ docker0 (172.17.x.x)
       └─ container network namespace
            └─ container eth0 (172.17.0.2) ← cluster port listen 在這，外面看不到
```

要從 host / 跨 host 連到容器內 listen port，必須：
1. **Port mapping**（`ports:`）做 NAT 轉發 — 但 cluster 通常 30+ port，全寫進 ports 維護不能
2. **`network_mode: host`** — 容器共用 host 的 network namespace，svrd 直接 bind host IP，等於「容器 = 裝在 host 上的 process」

cluster framework 設計時假設「我能直接 bind 主機 IP，其他節點直接連我這個 IP」——bridge mode 隔了一層 NAT 違反這假設。

## 解法

### prod 多 VM 必備：override 套 host network

主 `compose.yml` 保留 default bridge（dev all-in-one 同機 OK），prod 額外用 `compose.override.yml` 蓋過：

```yaml
# compose.prod.override.yml.example
services:
  tcp:
    network_mode: host
    ports: !reset []          # host network 下 ports mapping 無效，清空
    depends_on: !reset null   # 跨 host depends_on 失效，清空
    healthcheck:
      test: ["CMD", "bash", "-c", "exec 9<>/dev/tcp/127.0.0.1/9012"]
                                                 # ^^^^^^^^^^^^^ 容器 lo = host lo
  gate:
    network_mode: host
    ports: !reset []
    healthcheck:
      test: ["CMD", "bash", "-c", "exec 9<>/dev/tcp/127.0.0.1/9041"]
  # ... 其他 service 同樣處理
```

每台 prod host 上：

```bash
cd /home/deploy/<project>
cp compose.prod.override.yml.example compose.override.yml
docker compose up -d   # docker compose 自動讀同目錄 compose.override.yml
```

### 驗證

```bash
# 1. 容器 NetworkMode
docker inspect <container> --format '{{.HostConfig.NetworkMode}}'
# 期望：host
# 若是 default / bridge / xxx_default → override 沒生效

# 2. host 端 listen
ss -tnl | grep "$(hostname -I | awk '{print $1}'):"
# 期望：cluster port 都 listen 在 host IP

# 3. 跨 host 連通
nc -zv <peer-host> 9041
```

### 拓樸決策表

| 場景 | 網路模式 | 原因 |
|---|---|---|
| dev all-in-one（單容器跑全部） | default bridge | cluster 內部走 127.0.0.1，不需要對外 |
| dev 同機 multi-container | default bridge | service name DNS 互通，docker 自動處理 |
| **prod 多 VM** | **host** | **跨 host RPC 必備** |

## 關鍵洞察

- **`network_mode: host` 不是「expose port」的進化版，是「拿掉網路隔離」**：容器跟 host 共用 namespace，bind 一個 port = 直接 bind host
- **dev 跑通不代表 prod 跑通**：dev all-in-one / multi-container 同機都不會踩這坑，prod 多 VM 才會暴露
- **`depends_on` 跨 host 失效**：override 同時 `!reset null` 清掉，OP 自己控制啟動順序
- **healthcheck 走 `127.0.0.1`**：host network 下容器看不到 docker DNS，要用 loopback；剛好 = 主機 lo
- **`ports:` 在 host network 下無效**：寫了會 print warning，要用 `!reset []` 清空
- **macOS docker desktop 不適用**：mac 的 host network 是 VM 包了一層，跟 Linux 行為不同；只在 prod Linux host 用

## 關於 `cluster_clusters` 一類 cluster name 解析設定

不論 bridge 還是 host，cluster framework 內部用 **cluster name → IP:port** 解析：

```lua
-- skynet config_clusters 範例
gate_1 = "192.168.16.12:9041"    -- gate-A 主機 IP
gate_2 = "192.168.16.190:9042"   -- gate-B 主機 IP
```

`network_mode: host` 下，svrd `bind` 進去的就是這個 IP——必須是**主機真實內網 IP**才能讓其他 host 連得到，不能是 `127.0.0.1` 也不能是容器內部 IP。

裸機部署也是這設定，所以 host network 容器化版本能無痛沿用。
