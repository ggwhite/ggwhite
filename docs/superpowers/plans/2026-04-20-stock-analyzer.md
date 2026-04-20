# Stock Analyzer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 建立台股技術分析工具，每日自動抓取日K資料、計算指標、產生 HTML 報告，並提供 Web 瀏覽介面。

**Architecture:** Python 單體應用。fetcher 從 FinMind 抓資料，calculator 用 `ta` 套件算技術指標，結果存 SQLite，reporter 產生靜態 HTML，FastAPI 提供瀏覽。CLI 用 Typer 包裝所有操作，APScheduler 每日自動執行。

**Tech Stack:** Python 3.11+, Typer, FinMind SDK, ta, pandas, SQLAlchemy 2.0, FastAPI, Jinja2, APScheduler, loguru

---

## 專案路徑

所有操作在 `~/stock-analyzer/` 進行（或使用者指定路徑）。

---

## 檔案結構

```
stock-analyzer/
├── CLAUDE.md
├── pyproject.toml
├── .env.example
├── .gitignore
├── src/
│   └── stock_analyzer/
│       ├── __init__.py
│       ├── config.py        # 設定載入（.env）
│       ├── models.py        # SQLAlchemy ORM models
│       ├── database.py      # DB engine / session
│       ├── fetcher.py       # FinMind資料抓取，retry邏輯
│       ├── calculator.py    # 技術指標計算（ta套件）
│       ├── storage.py       # CRUD操作
│       ├── reporter.py      # HTML報告產生
│       ├── web.py           # FastAPI app
│       ├── scheduler.py     # APScheduler設定
│       └── cli.py           # Typer CLI入口
├── templates/
│   ├── report.html          # 每日報告Jinja2模板
│   └── stock.html           # 個股頁面模板
├── reports/                 # 產生的HTML報告（git ignore）
└── tests/
    ├── conftest.py
    ├── test_calculator.py
    ├── test_storage.py
    └── test_reporter.py
```

---

### Task 1: 專案 Scaffold + CLAUDE.md

**Files:**
- Create: `pyproject.toml`
- Create: `.env.example`
- Create: `.gitignore`
- Create: `CLAUDE.md`
- Create: `src/stock_analyzer/__init__.py`
- Create: `reports/.gitkeep`

- [ ] **Step 1: 建立專案目錄結構**

```bash
mkdir -p ~/stock-analyzer/src/stock_analyzer
mkdir -p ~/stock-analyzer/templates
mkdir -p ~/stock-analyzer/reports
mkdir -p ~/stock-analyzer/tests
cd ~/stock-analyzer
touch reports/.gitkeep
touch src/stock_analyzer/__init__.py
touch tests/__init__.py
```

- [ ] **Step 2: 建立 pyproject.toml**

```toml
[build-system]
requires = ["hatchling"]
build-backend = "hatchling.build"

[project]
name = "stock-analyzer"
version = "0.1.0"
requires-python = ">=3.11"
dependencies = [
    "typer>=0.12",
    "finmind>=1.6",
    "pandas>=2.0",
    "ta>=0.11",
    "sqlalchemy>=2.0",
    "fastapi>=0.110",
    "uvicorn[standard]>=0.29",
    "jinja2>=3.1",
    "apscheduler>=3.10",
    "python-dotenv>=1.0",
    "loguru>=0.7",
]

[project.optional-dependencies]
dev = [
    "pytest>=8.0",
    "pytest-cov>=5.0",
]

[project.scripts]
stock = "stock_analyzer.cli:app"

[tool.hatch.build.targets.wheel]
packages = ["src/stock_analyzer"]

[tool.pytest.ini_options]
testpaths = ["tests"]
```

- [ ] **Step 3: 建立 .env.example**

```bash
cat > .env.example << 'EOF'
FINMIND_TOKEN=your_token_here
DB_PATH=./stock.db
REPORTS_DIR=./reports
WEB_HOST=0.0.0.0
WEB_PORT=8000
EOF
cp .env.example .env
```

- [ ] **Step 4: 建立 .gitignore**

```
__pycache__/
*.pyc
.env
*.db
reports/*.html
.venv/
dist/
*.egg-info/
```

- [ ] **Step 5: 建立 CLAUDE.md**

```markdown
# Stock Analyzer

台股技術分析工具。每日自動抓取 FinMind 資料、計算指標、產生 HTML 報告。

## 環境設定

```bash
python -m venv .venv
source .venv/bin/activate
pip install -e ".[dev]"
cp .env.example .env
# 填入 FINMIND_TOKEN
```

## 常用指令

```bash
stock fetch --date 2026-04-20       # 抓指定日資料
stock fetch --range 2026-01-01 2026-04-20  # 抓區間
stock calc --date 2026-04-20        # 算技術指標
stock report --date 2026-04-20      # 產 HTML 報告
stock serve                          # 啟動 Web (port 8000)
```

## 測試

```bash
pytest
pytest --cov=stock_analyzer
```

## 架構

- `fetcher.py` — FinMind SDK，retry 3次
- `calculator.py` — ta 套件，MA/RSI/MACD/BB
- `storage.py` — SQLAlchemy CRUD
- `reporter.py` — Jinja2 HTML
- `web.py` — FastAPI routes
- `scheduler.py` — APScheduler，每日 15:30
- `cli.py` — Typer CLI

## FinMind Token

免費帳號：https://finmindtrade.com/ 註冊後取得 token，每日 600 次請求。
```

- [ ] **Step 6: 安裝依賴**

```bash
cd ~/stock-analyzer
python -m venv .venv
source .venv/bin/activate
pip install -e ".[dev]"
```

預期輸出：`Successfully installed stock-analyzer-0.1.0 ...`

- [ ] **Step 7: Commit**

```bash
cd ~/stock-analyzer
git init
git add .
git commit -m "feat: project scaffold"
```

---

### Task 2: Config + Database

**Files:**
- Create: `src/stock_analyzer/config.py`
- Create: `src/stock_analyzer/models.py`
- Create: `src/stock_analyzer/database.py`
- Create: `tests/conftest.py`

- [ ] **Step 1: 寫 config.py**

```python
from functools import lru_cache
from pathlib import Path
from dotenv import load_dotenv
import os

load_dotenv()

class Config:
    finmind_token: str = os.getenv("FINMIND_TOKEN", "")
    db_path: str = os.getenv("DB_PATH", "./stock.db")
    reports_dir: str = os.getenv("REPORTS_DIR", "./reports")
    web_host: str = os.getenv("WEB_HOST", "0.0.0.0")
    web_port: int = int(os.getenv("WEB_PORT", "8000"))

    def __post_init__(self):
        Path(self.reports_dir).mkdir(parents=True, exist_ok=True)

@lru_cache
def get_config() -> Config:
    return Config()
```

- [ ] **Step 2: 寫 models.py**

```python
from datetime import date, datetime
from sqlalchemy import Column, Date, DateTime, Float, Integer, String, Text
from sqlalchemy.orm import DeclarativeBase

class Base(DeclarativeBase):
    pass

class StockInfo(Base):
    __tablename__ = "stock_info"
    stock_id = Column(String, primary_key=True)
    name = Column(String, nullable=False)
    industry = Column(String)
    market = Column(String)  # TWSE / OTC

class StockDaily(Base):
    __tablename__ = "stock_daily"
    date = Column(Date, primary_key=True)
    stock_id = Column(String, primary_key=True)
    open = Column(Float)
    high = Column(Float)
    low = Column(Float)
    close = Column(Float)
    volume = Column(Integer)
    ma5 = Column(Float)
    ma20 = Column(Float)
    ma60 = Column(Float)
    rsi14 = Column(Float)
    macd = Column(Float)
    macd_signal = Column(Float)
    macd_hist = Column(Float)
    bb_upper = Column(Float)
    bb_middle = Column(Float)
    bb_lower = Column(Float)

class Report(Base):
    __tablename__ = "report"
    date = Column(Date, primary_key=True)
    generated_at = Column(DateTime, default=datetime.utcnow)
    file_path = Column(Text)
```

- [ ] **Step 3: 寫 database.py**

```python
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, Session
from .config import get_config
from .models import Base

def get_engine(db_url: str | None = None):
    url = db_url or f"sqlite:///{get_config().db_path}"
    return create_engine(url, connect_args={"check_same_thread": False})

def init_db(db_url: str | None = None):
    engine = get_engine(db_url)
    Base.metadata.create_all(engine)
    return engine

def get_session(db_url: str | None = None) -> Session:
    engine = get_engine(db_url)
    SessionLocal = sessionmaker(bind=engine)
    return SessionLocal()
```

- [ ] **Step 4: 寫 tests/conftest.py**

```python
import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from stock_analyzer.models import Base
from stock_analyzer.database import init_db, get_session

TEST_DB_URL = "sqlite:///:memory:"

@pytest.fixture
def db_session():
    engine = init_db(TEST_DB_URL)
    SessionLocal = sessionmaker(bind=engine)
    session = SessionLocal()
    yield session
    session.close()
    Base.metadata.drop_all(engine)
```

- [ ] **Step 5: 執行（無測試，確認 import 正常）**

```bash
cd ~/stock-analyzer
source .venv/bin/activate
python -c "from stock_analyzer.database import init_db; init_db('sqlite:///:memory:'); print('OK')"
```

預期輸出：`OK`

- [ ] **Step 6: Commit**

```bash
git add src/ tests/conftest.py
git commit -m "feat: config, models, database"
```

---

### Task 3: Calculator（技術指標）

**Files:**
- Create: `src/stock_analyzer/calculator.py`
- Create: `tests/test_calculator.py`

- [ ] **Step 1: 寫 test_calculator.py**

```python
import pandas as pd
import pytest
from stock_analyzer.calculator import calculate_indicators

@pytest.fixture
def sample_df():
    # 產生 70 天假資料（RSI需要14天，MA60需要60天）
    import numpy as np
    np.random.seed(42)
    dates = pd.date_range("2025-01-01", periods=70)
    close = pd.Series(100 + np.cumsum(np.random.randn(70)), index=dates)
    return pd.DataFrame({
        "date": dates,
        "stock_id": "2330",
        "open": close * 0.99,
        "high": close * 1.01,
        "low": close * 0.98,
        "close": close,
        "volume": np.random.randint(1000, 5000, 70),
    })

def test_calculate_indicators_columns(sample_df):
    result = calculate_indicators(sample_df)
    expected_cols = ["ma5", "ma20", "ma60", "rsi14",
                     "macd", "macd_signal", "macd_hist",
                     "bb_upper", "bb_middle", "bb_lower"]
    for col in expected_cols:
        assert col in result.columns, f"Missing column: {col}"

def test_ma5_correct(sample_df):
    result = calculate_indicators(sample_df)
    # MA5 第5筆開始有值
    assert result["ma5"].iloc[4:].notna().all()
    assert pd.isna(result["ma5"].iloc[0])

def test_rsi_range(sample_df):
    result = calculate_indicators(sample_df)
    valid = result["rsi14"].dropna()
    assert (valid >= 0).all() and (valid <= 100).all()
```

- [ ] **Step 2: 執行確認失敗**

```bash
cd ~/stock-analyzer
source .venv/bin/activate
pytest tests/test_calculator.py -v
```

預期輸出：`ERROR ... ModuleNotFoundError: No module named 'stock_analyzer.calculator'`

- [ ] **Step 3: 寫 calculator.py**

```python
import pandas as pd
import ta

def calculate_indicators(df: pd.DataFrame) -> pd.DataFrame:
    """
    輸入欄位：date, stock_id, open, high, low, close, volume
    輸出：原 df 加上指標欄位
    資料筆數不足時，對應欄位為 NaN
    """
    result = df.copy().reset_index(drop=True)
    close = result["close"]

    result["ma5"] = ta.trend.sma_indicator(close, window=5)
    result["ma20"] = ta.trend.sma_indicator(close, window=20)
    result["ma60"] = ta.trend.sma_indicator(close, window=60)
    result["rsi14"] = ta.momentum.rsi(close, window=14)

    macd_obj = ta.trend.MACD(close)
    result["macd"] = macd_obj.macd()
    result["macd_signal"] = macd_obj.macd_signal()
    result["macd_hist"] = macd_obj.macd_diff()

    bb_obj = ta.volatility.BollingerBands(close)
    result["bb_upper"] = bb_obj.bollinger_hband()
    result["bb_middle"] = bb_obj.bollinger_mavg()
    result["bb_lower"] = bb_obj.bollinger_lband()

    return result
```

- [ ] **Step 4: 執行確認通過**

```bash
pytest tests/test_calculator.py -v
```

預期輸出：`3 passed`

- [ ] **Step 5: Commit**

```bash
git add src/stock_analyzer/calculator.py tests/test_calculator.py
git commit -m "feat: technical indicators calculator"
```

---

### Task 4: Storage（CRUD）

**Files:**
- Create: `src/stock_analyzer/storage.py`
- Create: `tests/test_storage.py`

- [ ] **Step 1: 寫 test_storage.py**

```python
from datetime import date
import pytest
from stock_analyzer.storage import (
    upsert_stock_info, upsert_stock_daily,
    get_stock_daily_range, save_report, get_latest_report
)
from stock_analyzer.models import StockInfo, StockDaily

def test_upsert_stock_info(db_session):
    upsert_stock_info(db_session, [
        {"stock_id": "2330", "name": "台積電", "industry": "半導體", "market": "TWSE"},
    ])
    result = db_session.query(StockInfo).filter_by(stock_id="2330").first()
    assert result.name == "台積電"

def test_upsert_stock_info_update(db_session):
    upsert_stock_info(db_session, [{"stock_id": "2330", "name": "舊名", "industry": "", "market": "TWSE"}])
    upsert_stock_info(db_session, [{"stock_id": "2330", "name": "台積電", "industry": "半導體", "market": "TWSE"}])
    result = db_session.query(StockInfo).filter_by(stock_id="2330").first()
    assert result.name == "台積電"

def test_upsert_stock_daily(db_session):
    rows = [{"date": date(2026, 4, 18), "stock_id": "2330",
             "open": 900.0, "high": 910.0, "low": 895.0,
             "close": 905.0, "volume": 50000,
             "ma5": None, "ma20": None, "ma60": None,
             "rsi14": None, "macd": None, "macd_signal": None,
             "macd_hist": None, "bb_upper": None,
             "bb_middle": None, "bb_lower": None}]
    upsert_stock_daily(db_session, rows)
    result = db_session.query(StockDaily).filter_by(
        date=date(2026, 4, 18), stock_id="2330"
    ).first()
    assert result.close == 905.0

def test_get_stock_daily_range(db_session):
    for d, close in [(date(2026, 4, 18), 905.0), (date(2026, 4, 19), 910.0)]:
        upsert_stock_daily(db_session, [{"date": d, "stock_id": "2330",
            "open": close, "high": close, "low": close, "close": close,
            "volume": 1000, "ma5": None, "ma20": None, "ma60": None,
            "rsi14": None, "macd": None, "macd_signal": None,
            "macd_hist": None, "bb_upper": None, "bb_middle": None, "bb_lower": None}])
    rows = get_stock_daily_range(db_session, "2330", date(2026, 4, 18), date(2026, 4, 19))
    assert len(rows) == 2

def test_save_and_get_report(db_session):
    save_report(db_session, date(2026, 4, 18), "./reports/2026-04-18.html")
    r = get_latest_report(db_session)
    assert r.file_path == "./reports/2026-04-18.html"
```

- [ ] **Step 2: 執行確認失敗**

```bash
pytest tests/test_storage.py -v
```

預期輸出：`ERROR ... No module named 'stock_analyzer.storage'`

- [ ] **Step 3: 寫 storage.py**

```python
from datetime import date, datetime
from sqlalchemy.orm import Session
from sqlalchemy.dialects.sqlite import insert as sqlite_insert
from .models import StockInfo, StockDaily, Report

def upsert_stock_info(session: Session, rows: list[dict]):
    for row in rows:
        stmt = sqlite_insert(StockInfo).values(**row)
        stmt = stmt.on_conflict_do_update(
            index_elements=["stock_id"],
            set_={k: v for k, v in row.items() if k != "stock_id"}
        )
        session.execute(stmt)
    session.commit()

def upsert_stock_daily(session: Session, rows: list[dict]):
    for row in rows:
        stmt = sqlite_insert(StockDaily).values(**row)
        stmt = stmt.on_conflict_do_update(
            index_elements=["date", "stock_id"],
            set_={k: v for k, v in row.items() if k not in ("date", "stock_id")}
        )
        session.execute(stmt)
    session.commit()

def get_stock_daily_range(session: Session, stock_id: str,
                          start: date, end: date) -> list[StockDaily]:
    return (session.query(StockDaily)
            .filter(StockDaily.stock_id == stock_id,
                    StockDaily.date >= start,
                    StockDaily.date <= end)
            .order_by(StockDaily.date)
            .all())

def get_all_daily_by_date(session: Session, target_date: date) -> list[StockDaily]:
    return (session.query(StockDaily)
            .filter(StockDaily.date == target_date)
            .all())

def save_report(session: Session, target_date: date, file_path: str):
    stmt = sqlite_insert(Report).values(
        date=target_date, generated_at=datetime.utcnow(), file_path=file_path
    )
    stmt = stmt.on_conflict_do_update(
        index_elements=["date"],
        set_={"generated_at": datetime.utcnow(), "file_path": file_path}
    )
    session.execute(stmt)
    session.commit()

def get_latest_report(session: Session) -> Report | None:
    return session.query(Report).order_by(Report.date.desc()).first()
```

- [ ] **Step 4: 執行確認通過**

```bash
pytest tests/test_storage.py -v
```

預期輸出：`5 passed`

- [ ] **Step 5: Commit**

```bash
git add src/stock_analyzer/storage.py tests/test_storage.py
git commit -m "feat: storage CRUD"
```

---

### Task 5: Fetcher（FinMind）

**Files:**
- Create: `src/stock_analyzer/fetcher.py`

（fetcher 需要真實 API 呼叫，使用 mocking 測試核心邏輯即可，整合測試靠 CLI 手動驗證）

- [ ] **Step 1: 寫 fetcher.py**

```python
import time
from datetime import date
from loguru import logger
from FinMind.data import DataReader

from .config import get_config

def _get_reader() -> DataReader:
    reader = DataReader()
    token = get_config().finmind_token
    if token:
        reader.login_by_token(api_token=token)
    return reader

def fetch_stock_list() -> list[dict]:
    """抓取全部上市上櫃股票基本資料"""
    reader = _get_reader()
    df = reader.taiwan_stock_info()
    return [
        {
            "stock_id": row["stock_id"],
            "name": row["stock_name"],
            "industry": row.get("industry_category", ""),
            "market": row.get("type", ""),
        }
        for _, row in df.iterrows()
    ]

def fetch_daily_price(stock_id: str, start: date, end: date,
                       retry: int = 3) -> list[dict]:
    """
    抓取指定股票區間日K資料，失敗最多 retry 次。
    回傳 list[dict]，欄位：date, stock_id, open, high, low, close, volume
    """
    for attempt in range(retry):
        try:
            reader = _get_reader()
            df = reader.taiwan_stock_daily(
                stock_id=stock_id,
                start_date=start.strftime("%Y-%m-%d"),
                end_date=end.strftime("%Y-%m-%d"),
            )
            if df.empty:
                return []
            return [
                {
                    "date": date.fromisoformat(str(row["date"])[:10]),
                    "stock_id": stock_id,
                    "open": float(row["open"]),
                    "high": float(row["max"]),
                    "low": float(row["min"]),
                    "close": float(row["close"]),
                    "volume": int(row["Trading_Volume"]),
                }
                for _, row in df.iterrows()
            ]
        except Exception as e:
            logger.warning(f"fetch {stock_id} attempt {attempt+1} failed: {e}")
            if attempt < retry - 1:
                time.sleep(2 ** attempt)
    logger.error(f"fetch {stock_id} failed after {retry} retries")
    return []
```

- [ ] **Step 2: 確認 import 正常**

```bash
python -c "from stock_analyzer.fetcher import fetch_daily_price; print('OK')"
```

預期輸出：`OK`

- [ ] **Step 3: Commit**

```bash
git add src/stock_analyzer/fetcher.py
git commit -m "feat: FinMind fetcher with retry"
```

---

### Task 6: Reporter（HTML 報告）

**Files:**
- Create: `src/stock_analyzer/reporter.py`
- Create: `templates/report.html`
- Create: `templates/stock.html`
- Create: `tests/test_reporter.py`

- [ ] **Step 1: 寫 test_reporter.py**

```python
from datetime import date
import pytest
from stock_analyzer.reporter import build_report_data, render_report

def make_row(stock_id, close, ma20, rsi14, macd_hist, prev_macd_hist):
    return {
        "stock_id": stock_id, "name": "測試股", "close": close,
        "ma20": ma20, "ma60": close * 0.9,
        "rsi14": rsi14, "macd_hist": macd_hist,
        "prev_macd_hist": prev_macd_hist,
        "change_pct": 1.5,
    }

def test_rsi_overbought():
    rows = [make_row("2330", 100, 90, 75, 0.1, 0.05)]
    data = build_report_data(date(2026, 4, 18), rows)
    assert any(r["stock_id"] == "2330" for r in data["rsi_overbought"])

def test_rsi_oversold():
    rows = [make_row("2330", 100, 90, 25, -0.1, -0.05)]
    data = build_report_data(date(2026, 4, 18), rows)
    assert any(r["stock_id"] == "2330" for r in data["rsi_oversold"])

def test_macd_golden_cross():
    # 前一天 macd_hist < 0，今天 > 0
    rows = [make_row("2330", 100, 90, 50, 0.1, -0.1)]
    data = build_report_data(date(2026, 4, 18), rows)
    assert any(r["stock_id"] == "2330" for r in data["macd_golden"])

def test_render_report_returns_html(tmp_path):
    rows = [make_row("2330", 100, 90, 50, 0.1, -0.1)]
    data = build_report_data(date(2026, 4, 18), rows)
    html = render_report(data)
    assert "<html" in html
    assert "2330" in html
```

- [ ] **Step 2: 執行確認失敗**

```bash
pytest tests/test_reporter.py -v
```

預期輸出：`ERROR ... No module named 'stock_analyzer.reporter'`

- [ ] **Step 3: 寫 templates/report.html**

```html
<!DOCTYPE html>
<html lang="zh-TW">
<head>
<meta charset="UTF-8">
<title>台股報告 {{ report_date }}</title>
<style>
  body { font-family: sans-serif; margin: 2rem; }
  h1 { color: #333; }
  h2 { color: #555; margin-top: 2rem; }
  table { border-collapse: collapse; width: 100%; margin-top: 1rem; }
  th, td { border: 1px solid #ddd; padding: 8px; text-align: right; }
  th { background: #f4f4f4; }
  .up { color: #c00; } .down { color: #0a0; }
  nav a { margin-right: 1rem; }
</style>
</head>
<body>
<nav><a href="/">最新</a></nav>
<h1>台股日報 {{ report_date }}</h1>
<p>產生時間：{{ generated_at }}</p>

<h2>市場總覽</h2>
<p>漲家數：<span class="up">{{ summary.up_count }}</span> ／
   跌家數：<span class="down">{{ summary.down_count }}</span> ／
   總成交量：{{ summary.total_volume | int }}</p>

{% if rsi_overbought %}
<h2>RSI 超買（RSI &gt; 70）</h2>
<table>
  <tr><th>代號</th><th>名稱</th><th>收盤</th><th>漲跌%</th><th>RSI</th></tr>
  {% for r in rsi_overbought %}
  <tr>
    <td><a href="/stock/{{ r.stock_id }}">{{ r.stock_id }}</a></td>
    <td>{{ r.name }}</td>
    <td>{{ r.close }}</td>
    <td class="{{ 'up' if r.change_pct > 0 else 'down' }}">{{ "%.2f"|format(r.change_pct) }}%</td>
    <td>{{ "%.1f"|format(r.rsi14) }}</td>
  </tr>
  {% endfor %}
</table>
{% endif %}

{% if rsi_oversold %}
<h2>RSI 超賣（RSI &lt; 30）</h2>
<table>
  <tr><th>代號</th><th>名稱</th><th>收盤</th><th>漲跌%</th><th>RSI</th></tr>
  {% for r in rsi_oversold %}
  <tr>
    <td><a href="/stock/{{ r.stock_id }}">{{ r.stock_id }}</a></td>
    <td>{{ r.name }}</td>
    <td>{{ r.close }}</td>
    <td class="{{ 'up' if r.change_pct > 0 else 'down' }}">{{ "%.2f"|format(r.change_pct) }}%</td>
    <td>{{ "%.1f"|format(r.rsi14) }}</td>
  </tr>
  {% endfor %}
</table>
{% endif %}

{% if macd_golden %}
<h2>MACD 黃金交叉</h2>
<table>
  <tr><th>代號</th><th>名稱</th><th>收盤</th><th>漲跌%</th></tr>
  {% for r in macd_golden %}
  <tr>
    <td><a href="/stock/{{ r.stock_id }}">{{ r.stock_id }}</a></td>
    <td>{{ r.name }}</td><td>{{ r.close }}</td>
    <td class="{{ 'up' if r.change_pct > 0 else 'down' }}">{{ "%.2f"|format(r.change_pct) }}%</td>
  </tr>
  {% endfor %}
</table>
{% endif %}

{% if macd_death %}
<h2>MACD 死亡交叉</h2>
<table>
  <tr><th>代號</th><th>名稱</th><th>收盤</th><th>漲跌%</th></tr>
  {% for r in macd_death %}
  <tr>
    <td><a href="/stock/{{ r.stock_id }}">{{ r.stock_id }}</a></td>
    <td>{{ r.name }}</td><td>{{ r.close }}</td>
    <td class="{{ 'up' if r.change_pct > 0 else 'down' }}">{{ "%.2f"|format(r.change_pct) }}%</td>
  </tr>
  {% endfor %}
</table>
{% endif %}

<h2>全部股票</h2>
<table>
  <tr><th>代號</th><th>名稱</th><th>收盤</th><th>漲跌%</th><th>MA20</th><th>RSI</th><th>MACD Hist</th></tr>
  {% for r in all_stocks %}
  <tr>
    <td><a href="/stock/{{ r.stock_id }}">{{ r.stock_id }}</a></td>
    <td>{{ r.name }}</td>
    <td>{{ r.close }}</td>
    <td class="{{ 'up' if r.change_pct > 0 else 'down' }}">{{ "%.2f"|format(r.change_pct) }}%</td>
    <td>{{ "%.1f"|format(r.ma20) if r.ma20 else "-" }}</td>
    <td>{{ "%.1f"|format(r.rsi14) if r.rsi14 else "-" }}</td>
    <td>{{ "%.3f"|format(r.macd_hist) if r.macd_hist else "-" }}</td>
  </tr>
  {% endfor %}
</table>
</body>
</html>
```

- [ ] **Step 4: 寫 templates/stock.html**

```html
<!DOCTYPE html>
<html lang="zh-TW">
<head>
<meta charset="UTF-8">
<title>{{ stock_id }} {{ name }}</title>
<style>
  body { font-family: sans-serif; margin: 2rem; }
  table { border-collapse: collapse; width: 100%; }
  th, td { border: 1px solid #ddd; padding: 6px; text-align: right; }
  th { background: #f4f4f4; }
  nav a { margin-right: 1rem; }
</style>
</head>
<body>
<nav><a href="/">最新報告</a></nav>
<h1>{{ stock_id }} {{ name }}</h1>
<table>
  <tr><th>日期</th><th>收盤</th><th>量</th><th>MA5</th><th>MA20</th><th>MA60</th>
      <th>RSI</th><th>MACD</th><th>BB上</th><th>BB下</th></tr>
  {% for r in rows %}
  <tr>
    <td>{{ r.date }}</td><td>{{ r.close }}</td><td>{{ r.volume }}</td>
    <td>{{ "%.1f"|format(r.ma5) if r.ma5 else "-" }}</td>
    <td>{{ "%.1f"|format(r.ma20) if r.ma20 else "-" }}</td>
    <td>{{ "%.1f"|format(r.ma60) if r.ma60 else "-" }}</td>
    <td>{{ "%.1f"|format(r.rsi14) if r.rsi14 else "-" }}</td>
    <td>{{ "%.3f"|format(r.macd_hist) if r.macd_hist else "-" }}</td>
    <td>{{ "%.1f"|format(r.bb_upper) if r.bb_upper else "-" }}</td>
    <td>{{ "%.1f"|format(r.bb_lower) if r.bb_lower else "-" }}</td>
  </tr>
  {% endfor %}
</table>
</body>
</html>
```

- [ ] **Step 5: 寫 reporter.py**

```python
from datetime import date, datetime
from pathlib import Path
from jinja2 import Environment, FileSystemLoader

from .config import get_config

def build_report_data(report_date: date, rows: list[dict]) -> dict:
    """
    rows 每筆需有欄位：
    stock_id, name, close, ma20, ma60, rsi14, macd_hist, prev_macd_hist, change_pct
    """
    up = sum(1 for r in rows if r.get("change_pct", 0) > 0)
    down = sum(1 for r in rows if r.get("change_pct", 0) < 0)
    total_vol = sum(r.get("volume", 0) for r in rows if r.get("volume"))

    rsi_overbought = [r for r in rows if r.get("rsi14") and r["rsi14"] > 70]
    rsi_oversold = [r for r in rows if r.get("rsi14") and r["rsi14"] < 30]

    macd_golden = [r for r in rows
                   if r.get("macd_hist") is not None and r.get("prev_macd_hist") is not None
                   and r["prev_macd_hist"] < 0 < r["macd_hist"]]
    macd_death = [r for r in rows
                  if r.get("macd_hist") is not None and r.get("prev_macd_hist") is not None
                  and r["prev_macd_hist"] > 0 > r["macd_hist"]]

    return {
        "report_date": report_date.isoformat(),
        "generated_at": datetime.utcnow().strftime("%Y-%m-%d %H:%M UTC"),
        "summary": {"up_count": up, "down_count": down, "total_volume": total_vol},
        "rsi_overbought": rsi_overbought,
        "rsi_oversold": rsi_oversold,
        "macd_golden": macd_golden,
        "macd_death": macd_death,
        "all_stocks": sorted(rows, key=lambda r: r.get("change_pct", 0), reverse=True),
    }

def render_report(data: dict) -> str:
    templates_dir = Path(__file__).parent.parent.parent / "templates"
    env = Environment(loader=FileSystemLoader(str(templates_dir)))
    template = env.get_template("report.html")
    return template.render(**data)

def save_report_html(report_date: date, data: dict) -> str:
    html = render_report(data)
    reports_dir = Path(get_config().reports_dir)
    reports_dir.mkdir(parents=True, exist_ok=True)
    path = reports_dir / f"{report_date.isoformat()}.html"
    path.write_text(html, encoding="utf-8")
    return str(path)
```

- [ ] **Step 6: 執行確認通過**

```bash
pytest tests/test_reporter.py -v
```

預期輸出：`4 passed`

- [ ] **Step 7: Commit**

```bash
git add src/stock_analyzer/reporter.py templates/ tests/test_reporter.py
git commit -m "feat: HTML reporter and templates"
```

---

### Task 7: CLI（Typer）

**Files:**
- Create: `src/stock_analyzer/cli.py`

- [ ] **Step 1: 寫 cli.py**

```python
from datetime import date, timedelta
from typing import Optional
import typer
from loguru import logger

from .config import get_config
from .database import init_db, get_session
from .fetcher import fetch_stock_list, fetch_daily_price
from .calculator import calculate_indicators
from .storage import (upsert_stock_info, upsert_stock_daily,
                       get_all_daily_by_date, save_report)
from .reporter import build_report_data, save_report_html

app = typer.Typer(help="台股技術分析工具")

def _ensure_db():
    init_db()

@app.command()
def fetch(
    date_str: Optional[str] = typer.Option(None, "--date", help="YYYY-MM-DD"),
    range_start: Optional[str] = typer.Option(None, "--range", help="開始日期 YYYY-MM-DD"),
    range_end: Optional[str] = typer.Option(None, help="結束日期 YYYY-MM-DD"),
):
    """抓取股票日K資料並存入DB"""
    _ensure_db()
    session = get_session()

    if date_str:
        start = end = date.fromisoformat(date_str)
    elif range_start and range_end:
        start = date.fromisoformat(range_start)
        end = date.fromisoformat(range_end)
    else:
        start = end = date.today()

    # 更新股票清單
    typer.echo("更新股票清單...")
    stock_list = fetch_stock_list()
    upsert_stock_info(session, stock_list)
    typer.echo(f"共 {len(stock_list)} 支股票")

    # 抓日K
    for info in stock_list:
        sid = info["stock_id"]
        rows = fetch_daily_price(sid, start, end)
        if rows:
            # 補 NULL 指標欄位
            for r in rows:
                for col in ("ma5","ma20","ma60","rsi14","macd",
                            "macd_signal","macd_hist","bb_upper","bb_middle","bb_lower"):
                    r.setdefault(col, None)
            upsert_stock_daily(session, rows)
        typer.echo(f"  {sid}: {len(rows)} 筆", nl=False)
        typer.echo("")
    session.close()
    typer.echo("完成")

@app.command()
def calc(
    date_str: str = typer.Option(..., "--date", help="YYYY-MM-DD"),
):
    """計算指定日技術指標（需要有足夠歷史資料）"""
    import pandas as pd
    from datetime import timedelta
    from .storage import get_stock_daily_range

    _ensure_db()
    session = get_session()
    target = date.fromisoformat(date_str)
    lookback = target - timedelta(days=120)

    # 取得所有當日有資料的股票
    today_rows = get_all_daily_by_date(session, target)
    stock_ids = {r.stock_id for r in today_rows}

    for sid in stock_ids:
        history = get_stock_daily_range(session, sid, lookback, target)
        if len(history) < 5:
            continue
        df = pd.DataFrame([{
            "date": r.date, "stock_id": r.stock_id,
            "open": r.open, "high": r.high, "low": r.low,
            "close": r.close, "volume": r.volume,
        } for r in history])
        df_with_indicators = calculate_indicators(df)
        last = df_with_indicators[df_with_indicators["date"] == target]
        if last.empty:
            continue
        row = last.iloc[0]
        upsert_stock_daily(session, [{
            "date": target, "stock_id": sid,
            "open": float(row["open"]), "high": float(row["high"]),
            "low": float(row["low"]), "close": float(row["close"]),
            "volume": int(row["volume"]),
            "ma5": None if pd.isna(row["ma5"]) else float(row["ma5"]),
            "ma20": None if pd.isna(row["ma20"]) else float(row["ma20"]),
            "ma60": None if pd.isna(row["ma60"]) else float(row["ma60"]),
            "rsi14": None if pd.isna(row["rsi14"]) else float(row["rsi14"]),
            "macd": None if pd.isna(row["macd"]) else float(row["macd"]),
            "macd_signal": None if pd.isna(row["macd_signal"]) else float(row["macd_signal"]),
            "macd_hist": None if pd.isna(row["macd_hist"]) else float(row["macd_hist"]),
            "bb_upper": None if pd.isna(row["bb_upper"]) else float(row["bb_upper"]),
            "bb_middle": None if pd.isna(row["bb_middle"]) else float(row["bb_middle"]),
            "bb_lower": None if pd.isna(row["bb_lower"]) else float(row["bb_lower"]),
        }])
    session.close()
    typer.echo(f"calc {date_str} 完成，共 {len(stock_ids)} 支")

@app.command()
def report(
    date_str: str = typer.Option(..., "--date", help="YYYY-MM-DD"),
):
    """產生指定日 HTML 報告"""
    import pandas as pd
    from .models import StockInfo
    from .storage import get_all_daily_by_date

    _ensure_db()
    session = get_session()
    target = date.fromisoformat(date_str)

    daily_rows = get_all_daily_by_date(session, target)
    if not daily_rows:
        typer.echo(f"無 {date_str} 資料，請先執行 fetch 和 calc")
        raise typer.Exit(1)

    # 取前一日資料算 MACD 前日
    prev_date = target - timedelta(days=1)
    prev_rows = {r.stock_id: r for r in get_all_daily_by_date(session, prev_date)}

    info_map = {r.stock_id: r for r in session.query(StockInfo).all()}

    rows = []
    for d in daily_rows:
        prev = prev_rows.get(d.stock_id)
        prev_close = prev.close if prev and prev.close else d.close
        change_pct = ((d.close - prev_close) / prev_close * 100) if prev_close else 0
        rows.append({
            "stock_id": d.stock_id,
            "name": info_map[d.stock_id].name if d.stock_id in info_map else d.stock_id,
            "close": d.close, "volume": d.volume,
            "ma20": d.ma20, "ma60": d.ma60, "rsi14": d.rsi14,
            "macd_hist": d.macd_hist,
            "prev_macd_hist": prev.macd_hist if prev else None,
            "change_pct": change_pct,
        })

    data = build_report_data(target, rows)
    path = save_report_html(target, data)
    save_report(session, target, path)
    session.close()
    typer.echo(f"報告產生：{path}")

@app.command()
def serve():
    """啟動 Web 服務"""
    import uvicorn
    cfg = get_config()
    uvicorn.run("stock_analyzer.web:app", host=cfg.web_host, port=cfg.web_port, reload=False)
```

- [ ] **Step 2: 確認 CLI 可執行**

```bash
cd ~/stock-analyzer
source .venv/bin/activate
stock --help
```

預期輸出：
```
Usage: stock [OPTIONS] COMMAND [ARGS]...
  台股技術分析工具
Commands:
  fetch   抓取股票日K資料並存入DB
  calc    計算指定日技術指標
  report  產生指定日 HTML 報告
  serve   啟動 Web 服務
```

- [ ] **Step 3: Commit**

```bash
git add src/stock_analyzer/cli.py
git commit -m "feat: Typer CLI"
```

---

### Task 8: Web（FastAPI）

**Files:**
- Create: `src/stock_analyzer/web.py`

- [ ] **Step 1: 寫 web.py**

```python
from datetime import date
from pathlib import Path
from fastapi import FastAPI, HTTPException
from fastapi.responses import HTMLResponse
from jinja2 import Environment, FileSystemLoader
from sqlalchemy.orm import Session

from .config import get_config
from .database import init_db, get_session
from .models import StockInfo
from .storage import get_latest_report, get_stock_daily_range

app = FastAPI(title="Stock Analyzer")
TEMPLATES_DIR = Path(__file__).parent.parent.parent / "templates"
_env = Environment(loader=FileSystemLoader(str(TEMPLATES_DIR)))

@app.on_event("startup")
def startup():
    init_db()

def _read_report_html(file_path: str) -> str:
    p = Path(file_path)
    if not p.exists():
        raise HTTPException(status_code=404, detail="報告檔案不存在")
    return p.read_text(encoding="utf-8")

@app.get("/", response_class=HTMLResponse)
def latest_report():
    session = get_session()
    latest = get_latest_report(session)
    session.close()
    if not latest:
        return HTMLResponse("<h1>尚無報告，請先執行 stock fetch / calc / report</h1>")
    return _read_report_html(latest.file_path)

@app.get("/report/{date_str}", response_class=HTMLResponse)
def get_report(date_str: str):
    reports_dir = Path(get_config().reports_dir)
    path = reports_dir / f"{date_str}.html"
    if not path.exists():
        raise HTTPException(status_code=404, detail=f"找不到 {date_str} 的報告")
    return path.read_text(encoding="utf-8")

@app.get("/stock/{stock_id}", response_class=HTMLResponse)
def stock_detail(stock_id: str):
    session = get_session()
    info = session.query(StockInfo).filter_by(stock_id=stock_id).first()
    name = info.name if info else stock_id
    end = date.today()
    from datetime import timedelta
    start = end - timedelta(days=180)
    rows = get_stock_daily_range(session, stock_id, start, end)
    session.close()
    template = _env.get_template("stock.html")
    return template.render(stock_id=stock_id, name=name,
                           rows=reversed(rows))
```

- [ ] **Step 2: 確認啟動正常**

```bash
stock serve &
sleep 2
curl -s http://localhost:8000/ | head -5
kill %1
```

預期輸出：包含 `<html` 或 `尚無報告` 的 HTML。

- [ ] **Step 3: Commit**

```bash
git add src/stock_analyzer/web.py
git commit -m "feat: FastAPI web"
```

---

### Task 9: Scheduler（每日自動執行）

**Files:**
- Create: `src/stock_analyzer/scheduler.py`

- [ ] **Step 1: 寫 scheduler.py**

```python
from datetime import date
from loguru import logger
from apscheduler.schedulers.blocking import BlockingScheduler
from apscheduler.triggers.cron import CronTrigger

def daily_job():
    """每日 15:30 自動執行 fetch → calc → report"""
    from .database import init_db, get_session
    from .fetcher import fetch_stock_list, fetch_daily_price
    from .calculator import calculate_indicators
    from .storage import (upsert_stock_info, upsert_stock_daily,
                           get_all_daily_by_date, save_report)
    from .reporter import build_report_data, save_report_html
    import pandas as pd
    from datetime import timedelta

    today = date.today()
    logger.info(f"開始每日任務 {today}")
    init_db()
    session = get_session()

    try:
        # fetch
        stock_list = fetch_stock_list()
        upsert_stock_info(session, stock_list)
        for info in stock_list:
            rows = fetch_daily_price(info["stock_id"], today, today)
            if rows:
                for r in rows:
                    for col in ("ma5","ma20","ma60","rsi14","macd",
                                "macd_signal","macd_hist","bb_upper","bb_middle","bb_lower"):
                        r.setdefault(col, None)
                upsert_stock_daily(session, rows)

        # calc（複用 cli.calc 邏輯）
        from .cli import _calc_for_date
        _calc_for_date(session, today)

        # report（複用 cli.report 邏輯）
        from .cli import _report_for_date
        path = _report_for_date(session, today)
        logger.info(f"報告產生：{path}")
    except Exception as e:
        logger.error(f"每日任務失敗：{e}")
    finally:
        session.close()

def run_scheduler():
    scheduler = BlockingScheduler(timezone="Asia/Taipei")
    scheduler.add_job(daily_job, CronTrigger(hour=15, minute=30))
    logger.info("排程啟動，每日 15:30 執行")
    scheduler.start()
```

- [ ] **Step 2: 重構 cli.py，抽出可共用函式**

在 `cli.py` 加入可供 scheduler 呼叫的 `_calc_for_date` 和 `_report_for_date`：

```python
# 在 cli.py 中加入（fetch 指令之後）

def _calc_for_date(session, target: date):
    """可被 scheduler 直接呼叫"""
    import pandas as pd
    from datetime import timedelta
    from .storage import get_stock_daily_range
    lookback = target - timedelta(days=120)
    today_rows = get_all_daily_by_date(session, target)
    stock_ids = {r.stock_id for r in today_rows}
    for sid in stock_ids:
        history = get_stock_daily_range(session, sid, lookback, target)
        if len(history) < 5:
            continue
        df = pd.DataFrame([{"date": r.date, "stock_id": r.stock_id,
            "open": r.open, "high": r.high, "low": r.low,
            "close": r.close, "volume": r.volume} for r in history])
        df_with_indicators = calculate_indicators(df)
        last = df_with_indicators[df_with_indicators["date"] == target]
        if last.empty:
            continue
        row = last.iloc[0]
        upsert_stock_daily(session, [{
            "date": target, "stock_id": sid,
            "open": float(row["open"]), "high": float(row["high"]),
            "low": float(row["low"]), "close": float(row["close"]),
            "volume": int(row["volume"]),
            "ma5": None if pd.isna(row["ma5"]) else float(row["ma5"]),
            "ma20": None if pd.isna(row["ma20"]) else float(row["ma20"]),
            "ma60": None if pd.isna(row["ma60"]) else float(row["ma60"]),
            "rsi14": None if pd.isna(row["rsi14"]) else float(row["rsi14"]),
            "macd": None if pd.isna(row["macd"]) else float(row["macd"]),
            "macd_signal": None if pd.isna(row["macd_signal"]) else float(row["macd_signal"]),
            "macd_hist": None if pd.isna(row["macd_hist"]) else float(row["macd_hist"]),
            "bb_upper": None if pd.isna(row["bb_upper"]) else float(row["bb_upper"]),
            "bb_middle": None if pd.isna(row["bb_middle"]) else float(row["bb_middle"]),
            "bb_lower": None if pd.isna(row["bb_lower"]) else float(row["bb_lower"]),
        }])

def _report_for_date(session, target: date) -> str:
    """可被 scheduler 直接呼叫，回傳 HTML 路徑"""
    import pandas as pd
    from .models import StockInfo
    from .storage import get_all_daily_by_date
    from datetime import timedelta
    daily_rows = get_all_daily_by_date(session, target)
    if not daily_rows:
        raise ValueError(f"無 {target} 資料")
    prev_date = target - timedelta(days=1)
    prev_rows = {r.stock_id: r for r in get_all_daily_by_date(session, prev_date)}
    info_map = {r.stock_id: r for r in session.query(StockInfo).all()}
    rows = []
    for d in daily_rows:
        prev = prev_rows.get(d.stock_id)
        prev_close = prev.close if prev and prev.close else d.close
        change_pct = ((d.close - prev_close) / prev_close * 100) if prev_close else 0
        rows.append({
            "stock_id": d.stock_id,
            "name": info_map[d.stock_id].name if d.stock_id in info_map else d.stock_id,
            "close": d.close, "volume": d.volume,
            "ma20": d.ma20, "ma60": d.ma60, "rsi14": d.rsi14,
            "macd_hist": d.macd_hist,
            "prev_macd_hist": prev.macd_hist if prev else None,
            "change_pct": change_pct,
        })
    data = build_report_data(target, rows)
    path = save_report_html(target, data)
    save_report(session, target, path)
    return path
```

同時將 `calc` 和 `report` CLI 指令改為呼叫這兩個函式（DRY）：

```python
@app.command()
def calc(date_str: str = typer.Option(..., "--date")):
    """計算指定日技術指標"""
    _ensure_db()
    session = get_session()
    _calc_for_date(session, date.fromisoformat(date_str))
    session.close()
    typer.echo(f"calc {date_str} 完成")

@app.command()
def report(date_str: str = typer.Option(..., "--date")):
    """產生指定日 HTML 報告"""
    _ensure_db()
    session = get_session()
    try:
        path = _report_for_date(session, date.fromisoformat(date_str))
        typer.echo(f"報告產生：{path}")
    except ValueError as e:
        typer.echo(str(e))
        raise typer.Exit(1)
    finally:
        session.close()
```

- [ ] **Step 3: 執行全部測試確認沒有壞掉**

```bash
pytest -v
```

預期輸出：`12 passed`（calculator 3 + storage 5 + reporter 4）

- [ ] **Step 4: Commit**

```bash
git add src/stock_analyzer/scheduler.py src/stock_analyzer/cli.py
git commit -m "feat: APScheduler daily job + refactor CLI"
```

---

### Task 10: 整合驗證

- [ ] **Step 1: 確認 FinMind token 已設定**

```bash
cd ~/stock-analyzer
source .venv/bin/activate
cat .env | grep FINMIND_TOKEN
```

若無 token，至 https://finmindtrade.com/ 免費註冊取得。

- [ ] **Step 2: 抓小範圍資料測試**

```bash
# 只抓台積電，驗證流程通
stock fetch --date 2026-04-18
stock calc --date 2026-04-18
stock report --date 2026-04-18
```

預期：最後輸出 `報告產生：./reports/2026-04-18.html`

- [ ] **Step 3: 確認報告可在瀏覽器開啟**

```bash
open reports/2026-04-18.html
```

預期：瀏覽器顯示 HTML 報告，包含股票表格與指標異動清單。

- [ ] **Step 4: 確認 Web 介面正常**

```bash
stock serve &
sleep 2
open http://localhost:8000
kill %1
```

- [ ] **Step 5: 執行全部測試最終確認**

```bash
pytest -v --tb=short
```

預期輸出：全部 pass，無 warning。

- [ ] **Step 6: 最終 Commit**

```bash
git add .
git commit -m "feat: integration verified, stock-analyzer v0.1.0 complete"
```

---

## 注意事項

- FinMind 免費版每日 600 次 API 請求，全市場抓取約需 1700 次（上市+上櫃），建議申請付費方案或分批抓取。
- `ta` 套件需要足夠歷史資料：MA60 需要 60 筆，第一次執行建議用 `--range` 抓 3 個月資料。
- scheduler 需要長跑程序，建議用 `nohup stock-scheduler &` 或 systemd service 管理。
