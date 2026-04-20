# Stock Analyzer 設計文件

**日期：** 2026-04-20  
**市場：** 台股（TWSE / OTC）  
**使用者：** 個人使用，可能分享給朋友

---

## 概述

一個台股技術分析工具，每日自動抓取股票日K資料、計算技術指標、產生 HTML 報告，並提供 Web 介面瀏覽。支援 CLI 手動操作與排程自動執行。

---

## 架構

```
stock-analyzer/
├── cli/          # CLI 入口（Typer）
├── fetcher/      # FinMind API 資料抓取
├── calculator/   # 技術指標計算（pandas-ta）
├── storage/      # 資料庫存取（SQLite，SQLAlchemy）
├── reporter/     # 每日報告產生（HTML）
├── web/          # FastAPI，提供報告瀏覽
└── scheduler/    # 排程（APScheduler）
```

**資料流：**

```
每日排程（15:30）→ fetcher 抓台股日K
→ calculator 算指標 → storage 存 DB
→ reporter 產生 HTML → web 提供瀏覽
```

---

## 技術選型

| 用途 | 套件 |
|------|------|
| CLI | Typer |
| 資料來源 | FinMind SDK |
| 技術指標 | pandas-ta |
| 資料庫 | SQLite（SQLAlchemy ORM） |
| Web | FastAPI + Jinja2 |
| 排程 | APScheduler |
| Python 版本 | 3.11+ |

---

## 資料模型

### stock_info
```
stock_id    TEXT PRIMARY KEY
name        TEXT
industry    TEXT
market      TEXT  -- TWSE / OTC
```

### stock_daily
```
date        DATE
stock_id    TEXT
open        REAL
high        REAL
low         REAL
close       REAL
volume      INTEGER
ma5         REAL
ma20        REAL
ma60        REAL
rsi14       REAL
macd        REAL
macd_signal REAL
macd_hist   REAL
bb_upper    REAL
bb_middle   REAL
bb_lower    REAL
PRIMARY KEY (date, stock_id)
```

### report
```
date            DATE PRIMARY KEY
generated_at    DATETIME
file_path       TEXT
```

---

## CLI 介面

```bash
stock fetch --date 2026-04-20
stock fetch --range 2026-01-01 2026-04-20
stock calc --date 2026-04-20
stock report --date 2026-04-20
stock serve
```

---

## Web 路由

| 路由 | 說明 |
|------|------|
| `/` | 最新報告 |
| `/report/{date}` | 歷史報告 |
| `/stock/{stock_id}` | 個股歷史指標表格 |

報告以靜態 HTML 存檔，Web 層只負責瀏覽，不重新計算。

---

## 每日報告內容

- 日期與產生時間
- 市場總覽：漲跌家數、總成交量
- 技術指標異動清單：
  - RSI > 70（超買）/ RSI < 30（超賣）
  - MACD 黃金交叉 / 死亡交叉
  - 價格突破 MA20 或 MA60
- 可依條件排序的股票表格

---

## 錯誤處理

- FinMind API 失敗 → retry 3 次，記 log，跳過當日不中斷排程
- 股票資料缺漏 → log warning，指標欄位存 NULL

---

## 未來擴充（不在本次範圍）

- 財經新聞抓取與情緒分析
- 基本面資料（財報、EPS、殖利率）
- 多用戶支援
