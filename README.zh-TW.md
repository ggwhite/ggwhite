[English](README.md) | 繁體中文

[📄 履歷](https://ggwhite.github.io/resume/) · [📝 Blog](https://ggwhite.github.io/ggwhite/) · [📝 TIL](til/README.md) · [💼 LinkedIn](https://www.linkedin.com/in/white-chang/)

# 個人簡介

* 15 年後端工程師經歷，專精高併發分散式系統，橫跨遊戲、支付與企業 API 領域
* 具備 MongoDB 效能優化、Redis 架構設計實戰經驗，處理日均 ~270 萬筆資料規模；曾排查重複領獎的併發競態（race condition）並修復
* 熟悉 Kubernetes、Docker、GitLab CI/CD 等 DevOps 工具，具雲端與本地混合部署經驗
* AI 增強開發實踐者——主 session 負責規劃與拍板，worker agent 實作，獨立的 verifier agent 驗收，不信任 AI 自己回報的結果；我設計系統、AI 實作、AI 漏掉的由我把關
* 開源專案：go-masker（⭐ 130）、memory-mcp、jarvis、loupe、share-html；4x（⭐ 35）已封存

### [TIL — 今日所學](til/README.md)

### 開源專案

| 專案 | 說明 |
|------|------|
| [go-masker](https://github.com/ggwhite/go-masker) | 以 struct tag 遮罩敏感資料（密碼、Email、身分證、信用卡）的 Go 函式庫 · ⭐ 130 |
| [memory-mcp](https://github.com/ggwhite/memory-mcp) | AI coding agent 的跨 session 記憶，CLI 優先、SQLite FTS5、零外部相依 · ⭐ 1 |
| [jarvis](https://github.com/ggwhite/jarvis) | Claude Code mod：即時顯示 subagent、成本、檔案變更與所有 session 的 HUD 面板 |
| [loupe](https://github.com/ggwhite/loupe) | Claude Code mod：行內圖片縮圖與可縮放的全螢幕圖片檢視器 |
| [share-html](https://github.com/ggwhite/share-html) | Claude Code skill：可分享報告的單檔 HTML 模板（5 種風格 + 9 種 canvas 特效）· ⭐ 1 |
| [4x](https://github.com/ggwhite/4x)（已封存） | 已完成的實驗：多角色 AI 開發迴圈（Design / Code / Review / Test）搭配確定性護欄 · ⭐ 35。原生 Claude Code subagent 成熟後封存，核心原則「寫的人不驗自己」延續到現在的工作流程 |

### [技術能力](skills)
[`Golang`](skills/Golang.md) [`Java`](skills/Java.md) [`Lua`](skills/Lua.md) `JavaScript`

`Kubernetes` `Helm` `Docker` `GitLab CI/CD` `Harbor`

`MongoDB` `Redis` `MySQL` `PostgreSQL` `Oracle`

`Claude Code` `Codex` `memory-mcp` `GitHub Copilot`

`VSCode`

# 工作經歷

## [🇹🇼 大極科技 Tyche Tech Co, Ltd](employments/202101-tyche/README.zh-TW.md)
`資深後端服務工程師` 2021/01 - 現在

多平台遊戲系統架構規劃與技術決策。Lua/Skynet、Java、Golang。MongoDB/Redis 效能優化、資安強化、容器化遷移、CI/CD、DevOps。

## [🇹🇼 專羿行動 Terpro Mobile Co, Ltd](employments/201906-terpro/README.zh-TW.md)
`資深後端服務工程師` 2019/06 - 2020/12

開發老虎機遊戲底層框架（FreeGame、Lightning、PickGame）。Golang、Kubernetes/Helm。

## [🇹🇼 緯創軟體 WistronITS Corp. 駐點：台灣大哥大](employments/201609-wits-twm/README.zh-TW.md)
`資深後端工程師` 2016/09 - 2019/05

以 Pair Programming 與 Code Review 協助 2 名工程師，開發 Micro-service RESTful API，Golang/Java。CI/CD Pipeline、Docker 開發環境建置。

## [🇹🇼 康大資訊](employments/201507-kangda/README.zh-TW.md)
`軟體工程師` 2015/07 - 2016/08

政府標案（科技部）。Java、PostgreSQL。

## [🇹🇼 明基電通 BenQ Corp.](employments/201311-benq/README.zh-TW.md)
`軟體工程師` 2013/11 - 2015/02

電商 POC、eBookTaiwan 電子書平台。PHP、JavaScript、jQuery。

## [🇹🇼 智慧時尚 Fashion Intelligence Co, Ltd (Open-Life)](employments/201111-openlife/README.zh-TW.md)
`軟體工程師` 2011/11 - 2013/10

CMS 開發與維護。PHP、Yii、PostgreSQL。

# 接案專案

### PGS 遊戲服務器
2022/12 - 2023/04

獨立開發 3 款遊戲與後台管理網站
* 單人開發
* 遊戲服務器（Golang、TCP/Web Socket、gRPC）
* API 服務器（Golang、Gin、gRPC）
* 後台網站（Vue.js、Nuxt3、TailwindCSS）

### Yapro 汽車退稅管理系統
2021/01 - 2021/03
* 2 人小組協作
* RESTful API 服務器（Golang）
* AWS 服務建置（ECS、RDS）

### 木心 CarePro CMS
2013/11 - 2015/03
* 5 人團隊
* 服務器建置（Linode、CentOS、Apache、PHP、PostgreSQL）
