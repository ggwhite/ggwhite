[English](README.md) | 繁體中文

# 🇹🇼 大極科技 Tyche Tech Co, Ltd

`資深後端服務工程師` 2021/01 - 現在

## 專案

### 專案 C — 遊戲服務器與後台管理系統（Lua / Java）
* 遊戲服務器：Lua、Skynet
* 後台管理：Java、Spring Boot、MyBatis
* CI/CD：GitLab CI、SSH 部署

### 專案 B — 遊戲服務器與後台（Lua / PHP）
* 遊戲服務器：Lua（Gate、Lobby、Game 節點）
* 後台：PHP、Laravel
* CI/CD：GitLab CI、SSH 部署

### 專案 A — 遊戲服務器與後台（Golang / .Net）
* 遊戲服務器：Golang（TCP/WebSocket）
* CI/CD：GitLab CI、Kubernetes、Helm

## 主要成就

### 平台現代化（獨立主導）
* 以 Go 重寫 Lua/PHP/Java 混合遊戲平台，涵蓋 TCP gateway、遊戲引擎、BI 後台、支付服務
* 設計多租戶 config-driven 架構，單一 codebase 支援 13 個平台，取代各自 fork 的 release branch
* 設計 Proto2/Proto3 雙相容序列化層，舊 Lua client 無縫接入 Go 新系統
* 實作 Redis 資料 HMAC-SHA256 簽章機制，從架構層防禦資料竄改攻擊

### MongoDB 效能優化
* 診斷全集合掃描問題（每日約 270 萬筆資料）
* 設計複合索引，實作 Lua Server 排程自動預建每日索引

### Redis 架構優化
* 將以 rid 為變數的 key 結構改為 Hash 結構（rid 作為 field）
* 避免大量 SCAN 操作，提升查詢效率

### 資安強化
* 調查 Redis 資料竄改事件，追蹤完整攻擊鏈（遊戲狀態偽造 + 出款紀錄竄改）
* 設計 HMAC 簽章 + 狀態機 + audit trail 三層防護架構

### CI/CD Pipeline
* 設計並維護 GitLab CI/CD Pipeline
* 自動化建置 Docker Image 上傳至 Harbor Registry
* 透過 SSH 遠端操作 Docker Compose 完成開發環境部署

### Infrastructure & DevOps
* 建立 Helm Chart、架設 GitLab Runner
* 開發 Linux 服務器部署腳本

### 人才培育
* 帶領新進工程師，指導撰寫 test case，建立測試習慣
