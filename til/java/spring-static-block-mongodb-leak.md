# Spring 容器化後 static block 載入寫死 IP 的 MongoDB 連線

**日期：** 2026-06-18

## 問題

old-bi 容器化部署到 dev12 後，GM 後台不斷噴 `192.168.1.104:27017 Connection refused`，`AccountController.queryAccountOptionInfo` 等 API 回 30 秒 timeout。其他非容器化環境和正式環境看起來沒事。

## 原因

`employ-common` JAR 裡有一個 2017 年的 debug 殘留 class `io.renren.annotation.test`（同時也是 web.xml 的 shiroFilter class），它的 `static {}` block 會：

```java
static {
    ApplicationContext ctx = new GenericXmlApplicationContext("spring_mongodb.xml");
    MongoDBManager mongoDBManager = ctx.getBean("mongoDBManager", MongoDBManager.class);
    mongoDBManager.initConn();
}
```

1. `GenericXmlApplicationContext("spring_mongodb.xml")` 載入的是 JAR root-level 的 `spring_mongodb.xml`（寫死 `192.168.1.104`），不是 WAR `config/` 目錄裡用 `${bi.mongo.ip}` placeholder 的版本
2. `initConn()` 設定 `MongoDBManager` 的 `static runInstance` 欄位為 .104 的 instance
3. 主 Spring context 之後載入正確的 config.properties 覆蓋 `runInstance`，但 .104 的 `MongoClient` 背景 thread 持續重試連線

**為什麼只有 dev12 容器化有事：**

- 非容器化環境用的是**很久以前手動部署的舊 WAR**，`employ-common` JAR 裡剛好沒有 `test.class`（舊版 build）
- 正式環境（216 prod）容器化 build **有** `test.class`，但部署在 AWS VPC `192.168.16.x` 網段，連 `192.168.1.104` 的 TCP SYN 送不到目標（無 RST 回來），症狀不明顯
- dev12 辦公室 `192.168.1.x` 網段，.104 在同一 L2 → 立刻收到 RST → 每 10 秒狂噴 `Connection refused`

## 解法

刪掉 `test.java` 的 `static {}` block（保留 class 本身，web.xml 引用它作為 shiroFilter）：

```java
public class test extends DelegatingFilterProxy {
    // static block 已移除
}
```

## 關鍵洞察

- **`static {}` block 在 class loading 時執行**，比 Spring context 初始化更早。如果 static block 建立了共用 static 狀態（如 `runInstance`），會影響後續 Spring 管理的 bean
- **`classpath:spring_mongodb.xml`（無 path prefix）** 優先找 JAR root-level 的檔案，不是 WAR `config/spring_mongodb.xml` — 同名不同路徑
- **容器化全新 Maven build 會暴露舊部署不存在的 class** — 非容器化環境手動部署的 WAR 可能是古老版本，少了某些 class 反而沒出問題
- **網段不同會改變 TCP 失敗行為** — 同網段收 RST 狂噴 log，跨網段 SYN 靜默 timeout，同一個 bug 症狀天差地別
