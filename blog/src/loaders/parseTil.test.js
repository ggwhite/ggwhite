import { test } from "node:test";
import assert from "node:assert/strict";
import { parseTil, tilSlug } from "./parseTil.js";

const zh = `# Claude Desktop 畫 Claude Code mod 的坑

**日期：** 2026-10-15

## 問題

自己寫的 Claude Code mod（jarvis，\`ui.render\` 畫 pane）在終端機正常，搬到 **Claude Desktop** 出現[三種](https://x.y)狀況：

1. 整個 mod 沒載入。

## 原因

- something
`;

test("derives title, date and strips them from body", () => {
  const r = parseTil(zh);
  assert.equal(r.title, "Claude Desktop 畫 Claude Code mod 的坑");
  assert.equal(r.date, "2026-10-15");
  assert.ok(!r.body.includes("# Claude Desktop"));
  assert.ok(!r.body.includes("日期"));
  assert.ok(r.body.startsWith("## 問題"));
});

test("a 問題 that is only a colon lead-in yields no teaser; falls back to the title", () => {
  const r = parseTil(zh);
  assert.equal(r.description, "Claude Desktop 畫 Claude Code mod 的坑");
});

test("English Date line and Problem heading", () => {
  const r = parseTil(`# Codex Checkpoints\n\n**Date:** 2026-07-15\n\n## Problem\n\nA long task lost progress.\n\n## Cause\n\nx\n`);
  assert.equal(r.title, "Codex Checkpoints");
  assert.equal(r.date, "2026-07-15");
  // Too short on its own (< 50 chars): prefixed with the title, then the next section's prose.
  assert.equal(r.description, "Codex Checkpoints: A long task lost progress. x");
});

test("no date line and no problem heading: date null, first paragraph used", () => {
  const r = parseTil(`# T\n\nIntro para\nsecond line.\n\n## H\n\nmore\n`);
  assert.equal(r.date, null);
  assert.equal(r.description, "T: Intro para second line. more");
  assert.ok(r.body.startsWith("Intro para"));
});

test("description hard-truncated to 150 chars when no boundary exists", () => {
  const r = parseTil(`# T\n\n**日期：** 2026-01-01\n\n${"字".repeat(300)}\n`);
  assert.ok([...r.description].length <= 150);
  assert.ok(r.description.endsWith("…"));
});

const desc = md => parseTil(`# 標題測試\n\n**日期：** 2026-01-01\n\n${md}`).description;

test("description cuts at a sentence boundary, never mid-sentence, ≤ 150 chars", () => {
  const s1 = "第一句話描述了整個問題的背景，包含服務名稱與發生的環境，讀者看了就知道發生什麼事情了。";
  const s2 = "第二句補充了症狀與影響範圍，像是哪些 API 受影響、持續了多久時間以及使用者回報的狀況如何。";
  const s3 = "第三句很長很長".repeat(10) + "。";
  const d = desc(`## 問題\n\n${s1}${s2}${s3}\n`);
  assert.equal(d, s1 + s2);
  assert.ok([...d].length <= 150);
});

test("a single over-long sentence is cut at a clause boundary with an ellipsis", () => {
  const long = "這是一段".repeat(15) + "，" + "很長的子句".repeat(30) + "。";
  const d = desc(`## 問題\n\n${long}\n`);
  assert.equal(d, "這是一段".repeat(15) + "…");
});

test("hard-wrapped CJK lines join without stray spaces", () => {
  const d = desc(`## 問題\n\n一支用 flock 防重疊的 cron 監控腳本，某台機器連續多輪回報零命中。\n人工用同一套判準手動驗證，卻發現目標明明還在，五個服務全部中標了。\n`);
  assert.ok(d.includes("零命中。人工用"), d);
});

test("skips code blocks and list items; a short colon lead-in is dropped and prose continues", () => {
  const d = desc(
    "## 問題\n\n一個中文聊天機器人用 FTS5 全文檢索翻歷史對話。表建成這樣：\n\n```sql\nCREATE VIRTUAL TABLE t USING fts5(x);\n```\n\n- 清單項目一\n- 清單項目二\n\n## 原因\n\n預設的 unicode61 tokenizer 不會切中文，整句被當成一個 token，所以查詢關鍵字永遠比不到。\n"
  );
  assert.equal(
    d,
    "一個中文聊天機器人用 FTS5 全文檢索翻歷史對話。預設的 unicode61 tokenizer 不會切中文，整句被當成一個 token，所以查詢關鍵字永遠比不到。"
  );
});

test("a long colon lead-in is dropped, never a teaser; mid-sentence colons do not split", () => {
  const d = desc("## 問題\n\n兩個 session 講好共用一台租來的 GPU：A 先跑 6 張、不關機，B 接著跑 16 張、跑完關機。A 跑完之後，B 送出的整批任務卻全部失敗了：\n\n```\nerror\n```\n\nssh 進去看，佇列裡有三批不同前綴的任務。\n");
  assert.equal(d, "兩個 session 講好共用一台租來的 GPU：A 先跑 6 張、不關機，B 接著跑 16 張、跑完關機。ssh 進去看，佇列裡有三批不同前綴的任務。");
});

test("an ASCII ellipsis is not a sentence boundary", () => {
  const d = desc("## 問題\n\n影片 render 完後用 ffmpeg 做 grading 加換音軌（-map 0:v:0 -map 1:a:0 ... -shortest），成品時長比原始 render 短了好幾秒，結尾卡片整段被截掉了。\n");
  assert.ok(d.includes("1:a:0 … -shortest"), d);
  assert.ok(d.endsWith("被截掉了。"), d);
});

test("a colon lead-in is dropped even when the rest is short; the title fills in", () => {
  const d = desc("## 問題\n\n在 zsh 迴圈裡對多條分支跑 git log 計數：\n\n```zsh\nx\n```\n\n21 條分支全部回 0，看起來像沒有命中，其實每條都有兩到三個符合的提交。\n");
  assert.equal(d, "標題測試：21 條分支全部回 0，看起來像沒有命中，其實每條都有兩到三個符合的提交。");
});

test("never starts with code: a fenced block before prose is skipped", () => {
  const d = desc("## 問題\n\n```bash\nfor b in a b; do git log $b; done\n```\n\n在 zsh 迴圈裡對多條分支跑 git log 時，變數沒有被切成多個參數，結果每一輪都只看到第一條分支的紀錄。\n");
  assert.ok(d.startsWith("在 zsh 迴圈裡"), d);
});

test("a clause holding an HTML/JSX code span is cut out of the sentence", () => {
  const d = desc("## 問題\n\n寫了一個 Claude Code mod，在對話紀錄裡用 `<img>` 畫縮圖，外層終端機是 cmux，中間隔一層 herdr，結果圖片完全沒有出現在畫面上。\n");
  assert.equal(d, "寫了一個 Claude Code mod，外層終端機是 cmux，中間隔一層 herdr，結果圖片完全沒有出現在畫面上。");
});

test("too-short description (< 50 chars) is prefixed with the title", () => {
  const d = desc("## 問題\n\n台股選股工具的月營收資料永遠落後一期。\n");
  assert.equal(d, "標題測試：台股選股工具的月營收資料永遠落後一期。");
  assert.ok(d.includes("台股選股工具的月營收資料永遠落後一期。"));
});

test("English sentences split on '. ' but not inside version numbers", () => {
  const d = parseTil(
    "# T\n\n## Problem\n\nUpgrading to v0.1.0 broke the release pipeline in CI for three rounds in a row. Each round fixed one more trap in goreleaser and Tauri config. " +
      "This third sentence is deliberately long enough that adding it would push the description well past the one hundred and fifty character limit.\n"
  ).description;
  assert.equal(
    d,
    "Upgrading to v0.1.0 broke the release pipeline in CI for three rounds in a row. Each round fixed one more trap in goreleaser and Tauri config."
  );
});

test("missing H1 falls back to provided fallback title", () => {
  const r = parseTil(`no heading here\n`, { fallbackTitle: "my-file" });
  assert.equal(r.title, "my-file");
});

test("slug is URL-safe-ish: spaces to dashes, keeps CJK, lowercase", () => {
  assert.equal(tilSlug("Claude Desktop 畫 Claude Code mod 的坑.md"), "claude-desktop-畫-claude-code-mod-的坑");
  assert.equal(tilSlug("Roblox Translator FormatByKey 數字會顯示成 5.00.md"), "roblox-translator-formatbykey-數字會顯示成-5-00");
  assert.equal(tilSlug("CentOS-搬到-Ubuntu-後-cron-腳本被-dash-靜默打壞.md"), "centos-搬到-ubuntu-後-cron-腳本被-dash-靜默打壞");
});

// --- description quality: lead-ins, code residue, dedupe, takeaway, override ---

test("lead-in sentence before a code block is dropped and the takeaway is appended", () => {
  const d = desc(
    "## 問題\n\n一個中文聊天機器人用 SQLite FTS5 trigram 全文檢索翻找使用者的歷史對話紀錄。觸發器正常、索引筆數跟主表一致（446 = 446），但實際查詢的結果是：\n\n```\n0 rows\n```\n\n" +
      "## 原因\n\ntrigram 最少要三個字才能比對。\n\n## 關鍵洞察\n\n**測試資料剛好避開邊界，比沒有測試更危險。** 這個功能有四個測試，全都通過：\n"
  );
  assert.equal(
    d,
    "一個中文聊天機器人用 SQLite FTS5 trigram 全文檢索翻找使用者的歷史對話紀錄。測試資料剛好避開邊界，比沒有測試更危險。"
  );
});

test("sentences pointing at a block (像這樣/如下) are dropped even without a trailing colon", () => {
  const d = desc(
    "## 問題\n\n用 isolation worktree 派 subagent 跑 git 連續被拒，錯誤訊息像這樣。\n\n> refusing\n\n" +
      "## 關鍵洞察\n\n- 這個保護擋的是看不懂的指令，不是 git 本身，把指令寫成最直白的形式就會放行。\n- 第二點不該出現。\n"
  );
  assert.equal(d, "標題測試：這個保護擋的是看不懂的指令，不是 git 本身，把指令寫成最直白的形式就會放行。");
});

test("a sentence whose deictic subject (這行) points at code is dropped", () => {
  const d = desc(
    "## 問題\n\n寫給中文使用者看的 shell 腳本，訊息裡混用全形標點是家常便飯：\n\n```bash\nlog \"$round，\"\n```\n\n" +
      "這行讓整個 `write_report` 函式完全沒有執行。腳本沒有任何錯誤輸出，log 檔停在函式呼叫前的最後一行，看起來就像函式沒被呼叫。\n\n" +
      "## 關鍵洞察\n\n**`set -u` 加上管線過濾 stderr 等於靜默失敗。**\n"
  );
  assert.ok(!d.includes("這行"), d);
  assert.equal(d, "腳本沒有任何錯誤輸出，log 檔停在函式呼叫前的最後一行，看起來就像函式沒被呼叫。set -u 加上管線過濾 stderr 等於靜默失敗。");
});

test("JSX code span is removed with its clause; short identifiers stay", () => {
  const d = desc(
    "## 問題\n\n寫了一個 Claude Code mod，在對話紀錄裡用 `<Image source={{ file, format: 'png' }} />` 畫縮圖。外層終端機是 cmux（libghostty，支援 kitty graphics），中間隔一層 herdr，`Image` 只出現一行 alt。\n"
  );
  assert.ok(!/[{<]/.test(d), d);
  assert.equal(d, "寫了一個 Claude Code mod。外層終端機是 cmux（libghostty，支援 kitty graphics），中間隔一層 herdr，Image 只出現一行 alt。");
});

test("a parenthetical holding code residue is removed, the rest of the sentence kept", () => {
  const d = desc(
    "## 問題\n\n用 Roblox 內建多國語系（`LocalizationTable` + `Translator:FormatByKey(key, { n = 5 })`）時，Source 是 `\"{n} coins\"`，結果顯示成 `\"5.00 coins\"`。\n\n" +
      "## 關鍵洞察\n\n- FormatByKey 會把數字參數套上預設的小數格式，整數要先轉成字串再傳。\n"
  );
  assert.ok(!/[{<=]/.test(d), d);
  assert.equal(d, "用 Roblox 內建多國語系時，結果顯示成 \"5.00 coins\"。FormatByKey 會把數字參數套上預設的小數格式，整數要先轉成字串再傳。");
});

test("a sentence whose opening clause is a long command is dropped", () => {
  const d = desc(
    "## 問題\n\n`go get github.com/ggwhite/go-masker/zapfield@v0.1.0` 失敗——外部使用者拿到的 `go.mod` 裡有 `replace github.com/ggwhite/go-masker/v3 => ../`，`../` 在別人機器上不存在。\n\n" +
      "## 關鍵洞察\n\n- `replace` 是開發工具，不是發布工具，不該出現在 release tag 裡。\n"
  );
  assert.ok(!d.includes("=>"), d);
  assert.equal(d, "標題測試：replace 是開發工具，不是發布工具，不該出現在 release tag 裡。");
});

test("near-duplicate sentences are deduped", () => {
  const d = desc(
    "## 問題\n\n遊戲伺服器的 Redis 資料被攻擊者篡改，將遊戲狀態改為免費中獎狀態。最終整個資料庫被清空。\n\n最後整個資料庫仍被刪除。\n\n" +
      "## 關鍵洞察\n\n**加密保護的前提是 key 不能外洩。**\n"
  );
  assert.equal(d, "遊戲伺服器的 Redis 資料被攻擊者篡改，將遊戲狀態改為免費中獎狀態。最終整個資料庫被清空。加密保護的前提是 key 不能外洩。");
});

test("takeaway prefers 關鍵洞察, then 解法, then 原因, skipping one that does not fit", () => {
  const p = "一支每小時跑的排程一直印完成，看起來正常，但查 DB 發現三百檔裡有一百多檔資料落後了將近三週都沒有補上。";
  const longInsight = "這是一段很長的洞察".repeat(12) + "。";
  const md = insight =>
    `## 問題\n\n${p}\n\n## 原因\n\n原因是配額被昂貴的輪詢吃光。\n\n## 解法\n\n把便宜必要的工作排在前面。\n\n## 關鍵洞察\n\n${insight}\n`;
  assert.equal(desc(md("配額有限時，便宜且必要的工作要先做。")), p + "配額有限時，便宜且必要的工作要先做。");
  assert.equal(desc(md(longInsight)), p + "把便宜必要的工作排在前面。");
});

test("an HTML comment override is used verbatim", () => {
  const r = parseTil(
    "# T\n\n**日期：** 2026-01-01\n\n<!-- description: 自訂的描述，直接拿來用，不經過任何自動摘要處理。 -->\n\n## 問題\n\n自動摘要不該被用到。\n"
  );
  assert.equal(r.description, "自訂的描述，直接拿來用，不經過任何自動摘要處理。");
});

test("a trailing pointer clause (錯誤永遠是同一行：) is trimmed when two clauses remain", () => {
  const d = desc(
    "## 問題\n\n台股選股專案的每月 AI 分析排程（`stock value-analyze`），從 2026-08-11 起連續 16 天每天失敗，錯誤永遠是同一行：\n\n```\n逾時\n```\n\n" +
      "## 關鍵洞察\n\n**沒改程式碼所以不是我弄壞的是錯的直覺。**\n"
  );
  assert.equal(d, "台股選股專案的每月 AI 分析排程（stock value-analyze），從 2026-08-11 起連續 16 天每天失敗。沒改程式碼所以不是我弄壞的是錯的直覺。");
});

test("every 關鍵洞察 bullet is a candidate, terminated or not", () => {
  const d = desc(
    "## 問題\n\n同一個 docker tag 在多台 host 上 pull 到的 image SHA 不同，某些 host 拿到 broken 版本。\n\n" +
      "## 關鍵洞察\n\n- **mutable tag 是個指標、不是版本**：同 tag 不等於同內容\n- 多 host 部署時，不同 host 的 pull 時間不同\n"
  );
  assert.equal(d, "同一個 docker tag 在多台 host 上 pull 到的 image SHA 不同，某些 host 拿到 broken 版本。mutable tag 是個指標、不是版本：同 tag 不等於同內容。");
});

test("上面 meaning 'on top' is not a code reference; a sentence opening with 這樣 is", () => {
  const d = desc(
    "## 問題\n\n成品出現約 0.3 秒的黑閃，背景圖整片消失，但疊在上面的 HUD、對話框、角色立繪都還在。\n\n" +
      "## 解法\n\n這樣每台 host 拉同 tag 會鎖定到同一個 SHA。\n\n## 原因\n\n每個 worker 的第一幀還沒載入背景圖。\n"
  );
  assert.equal(d, "成品出現約 0.3 秒的黑閃，背景圖整片消失，但疊在上面的 HUD、對話框、角色立繪都還在。每個 worker 的第一幀還沒載入背景圖。");
});

test("a sentence left as a subordinate fragment after code removal is dropped", () => {
  const d = desc(
    "## 問題\n\nold-bi 容器化部署到 dev12 後，GM 後台不斷噴 `192.168.1.104:27017 Connection refused`，`AccountController.queryAccountOptionInfo` 等 API 回 30 秒 timeout。追查後發現 static block 在 Spring 之前就建好了連線，設定檔根本沒被讀到。\n"
  );
  assert.equal(d, "標題測試：追查後發現 static block 在 Spring 之前就建好了連線，設定檔根本沒被讀到。");
});

test("problem sentences fill to about 50 chars before the takeaway", () => {
  const d = desc(
    "## 問題\n\n寫了一個 Claude Code mod，在對話紀錄裡用 `<Image source={{ file }} />` 畫縮圖。外層終端機是 cmux，中間隔一層 herdr，圖片只出現一行 alt 文字。\n\n" +
      "## 關鍵洞察\n\n- 驗證有沒有真的畫要看 herdr pane read 的文字快照，圖片位置是一段空白列才代表真的有畫出來，只有一行 alt 代表圖片被關。\n"
  );
  assert.equal(d, "寫了一個 Claude Code mod。外層終端機是 cmux，中間隔一層 herdr，圖片只出現一行 alt 文字。驗證有沒有真的畫要看 herdr pane read 的文字快照，圖片位置是一段空白列才代表真的有畫出來，只有一行 alt 代表圖片被關。");
});

test("a short readable code span (≤ 30 chars, no markup) stays in the sentence", () => {
  const d = desc(
    "## 問題\n\nmemory-mcp 的搜尋把使用者輸入直接帶進 `WHERE memories_fts MATCH ?`，查到含連字號的字就爆 SQL 錯誤。\n"
  );
  assert.equal(d, "memory-mcp 的搜尋把使用者輸入直接帶進 WHERE memories_fts MATCH ?，查到含連字號的字就爆 SQL 錯誤。");
});

test("a takeaway block whose first sentence is dropped is skipped, not quoted mid-thought", () => {
  const d = desc(
    "## 問題\n\nold-bi 容器化部署到 dev12 之後，GM 後台的好幾支 API 都卡在 30 秒 timeout，其他環境看起來都沒事。\n\n" +
      "## 關鍵洞察\n\n- **`static {}` block 在 class loading 時執行**，比 Spring context 初始化更早。如果 static block 建立了共用狀態，會影響後續的 bean\n- 同名不同路徑的設定檔，classpath 會先找 JAR 根目錄。\n"
  );
  assert.equal(d, "old-bi 容器化部署到 dev12 之後，GM 後台的好幾支 API 都卡在 30 秒 timeout，其他環境看起來都沒事。同名不同路徑的設定檔，classpath 會先找 JAR 根目錄。");
});

test("a short takeaway reads on within its own block to reach 50 chars", () => {
  const d = desc(
    "## 問題\n\n搜尋把使用者輸入直接帶進 MATCH。\n\n" +
      "## 關鍵洞察\n\n- 參數綁定不等於跳脫。只要字串之後會被另一層語法解析，那一層要另外跳脫。\n- 第二個重點不該出現。\n"
  );
  assert.equal(d, "搜尋把使用者輸入直接帶進 MATCH。參數綁定不等於跳脫。只要字串之後會被另一層語法解析，那一層要另外跳脫。");
});
