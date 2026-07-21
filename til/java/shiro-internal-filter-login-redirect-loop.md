# 自訂 Shiro AccessControlFilter 取代 authc 時，loginUrl 沒排除進 anon 會自我重導向死循環

**日期：** 2026-07-21

## 問題

216-xk（老台子 old-bi）prod 後台，商戶基本配置頁面修改商戶名稱，前端顯示「OK」，但 reload 後名稱沒變。

## 原因

`GMDataController.send()` 改完商戶名稱後會 POST 廣播通知 data/gm/pay 三個角色容器更新記憶體快取（`GM/updatashanghuinform`），但這個廣播請求完全沒帶任何認證。

專案之前為了修 server-to-server 內部呼叫的認證問題，寫了一支 `InternalTokenFilter extends AccessControlFilter` 取代 Shiro 內建的 `authc`，套用在 `/**`（幾乎所有路徑）。邏輯是：沒 session 又沒帶 `X-BI-Internal-Token` header 的請求一律導去 `loginUrl`（`/login.html`）。

問題在於：`filterChainDefinitions` 裡忘了把 `/login.html` 本身排除到 `anon`。於是 `/login.html` 也落在 `/**=internalToken` 保護範圍內——沒認證的請求被導去 `/login.html`，但 `/login.html` 這個請求本身一樣沒認證，又被導去 `/login.html`……無限重導向：

```
java.net.ProtocolException: Server redirected too many times (20)
```

`GMDataController.send()` 這條廣播路徑用的是 `employ-common.SendRequestUtils`（跟 `login-common.SendRequestUtils` 是兩份獨立程式碼，同名不同 class），從一開始就沒有 token 注入機制，跟已經修好的「login-web → data/gm/pay」轉發（那邊有另外補 JSESSIONID cookie 轉發）是完全不同的呼叫路徑，之前修的時候漏掉了。

## 解法

兩處都要修，缺一不可：

1. **補認證**：`employ-common/SendRequestUtils` 新增 `internalToken` static field（比照 `login-common` 既有機制），呼叫端（`YurneroTool.sendHttpStr`）附上 `X-BI-Internal-Token` header；新增 `InternalTokenInitializer`（`@Component` + `@PostConstruct`）從 `secret.bi.internal.token` 注入。
2. **防禦性排除**：`renren-shiro.xml` 的 `filterChainDefinitions` 補上 `/login.html=anon`。

MR：https://git.tyche-tech.io/server/infinite/old-bi/-/merge_requests/621（已合併進 `release/216-xk-星空`）

## 關鍵洞察

- 自訂 `AccessControlFilter`（或任何取代 Shiro `authc` 的認證機制）套用在 `/**` 時，**務必**檢查 `loginUrl` 本身有沒有排除在保護範圍外。這是 Shiro 內建 `FormAuthenticationFilter` 靠 `isLoginRequest()` 自動處理掉的細節，自己刻 filter 很容易漏掉。
- 一個系統裡如果有多份同名但不同 package 的 util class（這裡是兩份 `SendRequestUtils`，分屬 `login-common` 與 `employ-common`），修認證/安全性的 patch 很容易只改到其中一份、漏掉另一份呼叫路徑。排查時要記得 grep 全部同名 class，不能只看第一個找到的。
- 影響範圍判斷用 `git log <branch> --oneline -- <path>` 比 SSH 上機查快很多——直接看某個 release 分支的歷史有沒有含特定 commit/檔案，就能排除掉不受影響的環境，不用每個都上機驗證。
