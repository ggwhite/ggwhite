# Python sqlite3 的 `with conn:` 拿不到原子性——當 repo 函式自己 commit

**日期：** 2026-07-30

## 問題

yuna 專案有一個排程，每天把抽取出來的事實寫進 `facts` 表，然後在另一張表標記「這天處理過了」：

```python
for content in found:
    remember_fact(conn, "yuna", content)   # 寫一筆事實
mark_scanned(conn, day)                     # 標記這天處理過
```

Review 指出這不是原子操作：中途失敗（`database is locked`、process 被砍）會留下「事實寫進去了、但沒標記」，下一輪重跑就重複寫入同一批。在一個每 10 分鐘醒一次的常駐服務上，那等於每 10 分鐘複寫一次同一批資料。

第一直覺的修法是包起來：

```python
with conn:
    for content in found:
        remember_fact(conn, "yuna", content)
    mark_scanned(conn, day)
```

**這個沒有用。**

## 原因

`remember_fact` 與 `mark_scanned` 各自在裡面呼叫了 `conn.commit()`：

```python
def remember_fact(conn, subject, content):
    cur = conn.execute("INSERT INTO facts (subject, content) VALUES (?, ?)", (subject, content))
    conn.commit()          # ← 這一行
    return cur.lastrowid
```

`with conn:` 的語意是「離開區塊時 commit，有例外就 rollback」，它**不是**巢狀交易也不是 savepoint。內層每一次 `commit()` 都會把當下的交易提交掉並結束它，於是：

- 第 1 筆 `remember_fact` → commit，資料已經落地
- 第 2 筆炸掉 → `with conn:` 的 `__exit__` 執行 rollback，但**它只能 rollback 那個當下還開著的交易**，第 1 筆早就提交完了，回不來

換句話說，只要交易邊界內有人自己 commit，外層的 `with conn:` 就退化成裝飾品。

## 解法

原子性必須由**不 commit 的敘述**組成。做法是給這個批次操作一個專屬函式，裡面只用裸的 `execute` / `executemany`：

```python
def record_scan(conn, event_date: str, contents: list[str]) -> None:
    """一天的處理結果：抽到的事實與「這天處理過了」的標記，同一個交易寫進去。

    分兩步寫的話中間失敗會留下「事實寫了、但沒標記」，下一輪重跑就再寫一次
    同樣的內容。remember_fact 各自 commit 是為了單筆寫入那條路（MCP 工具），
    批次補寫要的是全有或全無。
    """
    with conn:
        conn.executemany(
            "INSERT INTO facts (subject, content) VALUES ('yuna', ?)",
            [(c,) for c in contents],
        )
        conn.execute(
            "INSERT OR IGNORE INTO self_fact_scans (event_date) VALUES (?)", (event_date,)
        )
```

**沒有把 `remember_fact` 改成不 commit。** 它有另一條呼叫路徑（MCP 工具，模型在對話中一次記一筆）需要立刻落地，改它會波及那邊。兩種語意就寫成兩個函式。

`executemany` 對空 list 不會拋錯，所以 `contents=[]` 仍然會走完並寫下標記——這正好是要的行為（那天真的沒東西可寫，但仍然算處理過）。

## 怎麼證明它真的原子

用一個轉發代理注入失敗，只在寫標記那一步炸：

```python
def test_a_failed_record_scan_leaves_nothing_behind():
    conn = connect(":memory:")

    class FailOnTheMark:
        def __init__(self, real): self._real = real
        def executemany(self, *a, **k): return self._real.executemany(*a, **k)
        def commit(self): return self._real.commit()
        def __enter__(self): return self._real.__enter__()
        def __exit__(self, *a): return self._real.__exit__(*a)
        def execute(self, sql, *a, **k):
            if "self_fact_scans" in sql:
                raise sqlite3.OperationalError("database is locked")
            return self._real.execute(sql, *a, **k)

    with pytest.raises(sqlite3.OperationalError):
        record_scan(FailOnTheMark(conn), "2026-07-29", ["怕很重的中藥味"])

    assert list_facts(conn) == []                                   # 事實沒留下
    assert missing_scan_dates(conn, ["2026-07-29"]) == ["2026-07-29"]  # 標記也沒留下
```

注意 **`conn.execute = my_func` 蓋不掉**——`sqlite3.Connection` 是唯讀的 C 型別，instance 賦值丟 `AttributeError: attribute is read-only`，class 賦值丟 `TypeError: cannot set attribute of immutable type`。只能用代理物件包起來。

寫完這個測試一定要**先確認它會紅**：把 `record_scan` 暫時改回兩次各自 commit 的版本跑一次，看到 `list_facts(conn)` 真的多出一筆、斷言失敗，再改回來。沒做這一步的話，你不知道自己測的是原子性還是別的東西。

## 關鍵洞察

- **`with conn:` 只在「區塊內沒有任何 commit」時才有原子性。** 它不是 savepoint，不會巢狀。repo 層習慣性地每個函式結尾 `conn.commit()`，等於讓所有呼叫端都無法組合出更大的交易單位。
- 遇到這種情況**不要去改既有 CRUD 的 commit 行為**——那些函式通常有別的呼叫路徑依賴立刻落地。開一個專屬於這個批次語意的函式，才是不會波及別人的做法。
- 判斷「這兩步該不該原子」的方法：問「中間失敗會留下什麼中間態，下一輪重跑會發生什麼」。這裡的答案是「重複寫入」，而重複的資料如果會被全量注入 LLM context 或被使用者看到，那就是必須修的。
- 對照組：同專案的 `diary_repo.set_entry` 是單一 `INSERT OR REPLACE` 包在 `with conn:` 裡，天生沒有這個問題。**寫入拆成 N+1 個獨立 commit 的地方，就是要檢查原子性的地方。**
