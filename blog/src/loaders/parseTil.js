// Parse a TIL markdown file that has no frontmatter:
//   # Title
//   **日期：** YYYY-MM-DD   (or **Date:** YYYY-MM-DD)
//   body...

const H1_RE = /^#\s+(.+?)\s*#*\s*$/;
const DATE_RE =
  /^\*\*\s*(?:日期|Date)\s*[：:]?\s*\*\*\s*[：:]?\s*(\d{4}-\d{2}-\d{2})\s*$/i;
const PROBLEM_RE = /^(?:問題|Problem)$/i;
/** Takeaway sections, in order of preference. */
const TAKEAWAY_RES = [/^(?:關鍵洞察|Key Insights?)$/i, /^(?:解法|Solution|Fix)$/i, /^(?:原因|Cause)$/i];
/**
 * Escape hatch: a TIL file may carry `<!-- description: ... -->` (invisible when
 * rendered); its text is used verbatim as the meta description.
 */
const OVERRIDE_RE = /<!--\s*description:\s*([\s\S]*?)\s*-->/i;
/** Meta-description bounds, in characters (code points). */
const DESC_MAX = 150;
const DESC_MIN = 50;
/** Lead with at least this much problem before the takeaway, when it fits. */
const PROBLEM_MIN = 50;
/** Stop adding sentences once the description reaches this length. */
const DESC_TARGET = 80;
/** Inline code longer than this reads as residue in a snippet and is removed. */
const CODE_MAX = 30;
/** Bigram overlap (of the shorter sentence) at which two sentences count as duplicates. */
const DUP_OVERLAP = 0.4;

const CJK_RE = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\u3000-\u303f\uff00-\uffef]/u;

/** Join two text fragments: no space between CJK neighbours, one space otherwise. */
function joinText(a, b) {
  if (!a) return b;
  if (!b) return a;
  return CJK_RE.test(a.at(-1)) || CJK_RE.test(b[0]) ? a + b : `${a} ${b}`;
}

/** Strip inline markdown so the text reads cleanly in cards and meta tags. */
function plainText(md) {
  // Code spans keep their content verbatim (an `<img>` in backticks is text, not a tag).
  return md
    .split(/(`[^`]*`)/)
    .map(part =>
      part.startsWith("`") && part.endsWith("`") && part.length > 1
        ? part.slice(1, -1)
        : part
            .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
            .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
            .replace(/(\*\*|__)(.*?)\1/g, "$2")
            .replace(/(^|[^*])\*([^*\s][^*]*)\*/g, "$1$2")
            .replace(/<[^>]+>/g, "")
    )
    .join("")
    .replace(/\s+/g, " ")
    .trim();
}

/** A list item: `- x`, `* x`, `+ x`, `1. x`, `1) x`. */
const LIST_RE = /^([-*+]|\d+[.)])\s+/;

/**
 * Prose paragraphs in `lines`, as inline markdown (code spans intact). Skips
 * headings, fences, tables, rules and blockquotes so code never leaks in. List
 * items are skipped too, unless `lists` is set: then each item is a paragraph.
 * `beforeBlock` marks a prose paragraph followed directly by a fence, list,
 * table or quote: its last sentence usually introduces that block.
 * @returns {{ md: string, beforeBlock: boolean }[]}
 */
function proseParagraphs(lines, { lists = false } = {}) {
  const paras = [];
  let inFence = false;
  let buf = [];
  let isItem = false;
  let last = null; // the prose paragraph just closed, until something else follows it
  const flush = () => {
    if (buf.length) {
      const para = { md: buf.reduce(joinText, ""), beforeBlock: false };
      paras.push(para);
      last = isItem ? null : para;
    }
    buf = [];
    isItem = false;
  };
  const blockStarts = () => {
    flush();
    if (last) last.beforeBlock = true;
    last = null;
  };
  for (const line of lines) {
    const t = line.trim();
    if (t.startsWith("```") || t.startsWith("~~~")) {
      if (!inFence) blockStarts();
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;
    if (t === "") {
      flush();
      continue;
    }
    if (lists && LIST_RE.test(t)) {
      blockStarts();
      buf.push(t.replace(LIST_RE, ""));
      isItem = true;
      continue;
    }
    if (/^\|/.test(t) || LIST_RE.test(t) || t.startsWith(">") || t.startsWith("<")) {
      blockStarts();
      continue;
    }
    if (/^#{1,6}\s/.test(t) || /^([-*_])\1{2,}$/.test(t)) {
      flush();
      last = null;
      continue;
    }
    if (!buf.length) last = null;
    buf.push(t);
  }
  flush();
  return paras;
}

/**
 * Split plain text into sentences, keeping the terminator. "v0.1.0", "a:b"
 * and "..." are not boundaries; colons never split.
 */
function sentences(text) {
  return (
    text
      .replace(/\.{3}/g, "…")
      .match(/(?:[^。！？.!?]|[.!?](?!\s|$))+(?:[。！？]+|[.!?]+|$)/gu) ?? []
  )
    .map(s => s.trim())
    .filter(Boolean);
}

const len = s => [...s].length;

/** Cut an over-long sentence at the last clause boundary that fits, or hard-cut. */
function cutSentence(s, max = DESC_MAX) {
  const chars = [...s];
  if (chars.length <= max) return s;
  const head = chars.slice(0, max - 1).join("");
  const m = [...head.matchAll(/[，、,；;]/gu)].at(-1);
  if (m && len(head.slice(0, m.index)) >= 20) {
    return head.slice(0, m.index).trimEnd() + "…";
  }
  return head.trimEnd() + "…";
}

// Code spans are swapped for these markers while sentences are filtered, so
// punctuation inside code never splits a sentence or a clause.
const CODE_OPEN = "";
const CODE_CLOSE = "";
const CODE_REF_RE = /(\d+)/g;
/** Code that reads as residue in a snippet: long, or markup/JSX/assignments. */
const isBadCode = code => len(code) > CODE_MAX || /[{<=]/.test(code);

/** Sentence ends by pointing at a block it cannot show ("結果是：", "如下"). */
const LEADIN_RE = /[：:]$|如下|像這樣|以下/;
/** The clause of a lead-in that does the pointing ("錯誤永遠是同一行", "結果是"). */
const POINTER_RE = /這樣|如下|以下|下面|結果是|回傳|同一行|寫成|如此/;
/** Deictic words whose referent is the code next to the sentence, not in it. */
const DEICTIC_RE =
  /^這樣|這行|這幾行|這段(?:程式|code|設定|指令|腳本)|這串|這句|這個指令|這條指令|上面這|下面這|上述|如上/;
/** A clause that only sets up time or condition ("部署到 dev12 後") is not a sentence. */
const SUBORDINATE_RE = /(?:後|時|前|時候|的話)$/;
const TERMINATOR_RE = /[。！？.!?…]$/;
/** Top-level clause separators; "——" joins a symptom to its explanation. */
const CLAUSE_SEP_RE = /^(?:——|—|，|,|；|;)/;
const OPEN_BRACKETS = "（(「『[【";
const CLOSE_BRACKETS = "）)」』]】";

/** Split a sentence into top-level clauses: [{ sep, text }], `sep` precedes `text`. */
function clauses(s) {
  const out = [{ sep: "", text: "" }];
  let depth = 0;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (OPEN_BRACKETS.includes(ch)) depth++;
    else if (CLOSE_BRACKETS.includes(ch)) depth = Math.max(0, depth - 1);
    const sep = depth === 0 && s.slice(i).match(CLAUSE_SEP_RE);
    if (sep) {
      out.push({ sep: sep[0], text: "" });
      i += sep[0].length - 1;
    } else {
      out.at(-1).text += ch;
    }
  }
  return out;
}

/**
 * Clean one masked sentence: remove code residue, or return null to drop it.
 * A parenthetical holding bad code goes first; then any later clause holding
 * bad code. Bad code in the opening clause carries the subject, so the whole
 * sentence is dropped.
 */
function cleanSentence(s, codes) {
  const hasBad = t => [...t.matchAll(CODE_REF_RE)].some(m => isBadCode(codes[m[1]]));
  let out = s.replace(/\s*[（(][^（）()]*[）)]/g, m => (hasBad(m) ? "" : m));
  if (hasBad(out)) {
    const end = out.match(/[。！？.!?…]+$/)?.[0] ?? "";
    const parts = clauses(out.slice(0, out.length - end.length));
    if (hasBad(parts[0].text)) return null;
    const kept = parts.filter(p => !hasBad(p.text));
    if (SUBORDINATE_RE.test(kept.at(-1).text.trim())) return null;
    out = kept.map(p => p.sep + p.text).join("").trimEnd() + end;
  }
  return out
    .replace(CODE_REF_RE, (_, n) => codes[n])
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * A lead-in ("…連續 16 天每天失敗，錯誤永遠是同一行：") keeps its facts when the
 * pointing clause is last and at least two clauses remain; otherwise null.
 */
function trimLeadIn(s) {
  const parts = clauses(s.replace(/\s*[：:。.]$/, ""));
  if (parts.length < 3 || !POINTER_RE.test(parts.at(-1).text)) return null;
  const kept = parts
    .slice(0, -1)
    .map(p => p.sep + p.text)
    .join("")
    .trimEnd();
  return closeSentence(kept);
}

/**
 * Sentences of a paragraph as plain text, null where a sentence is unfit for a
 * description: lead-ins that point at a block ("錯誤訊息像這樣："), sentences
 * whose subject is the adjacent code ("這行讓…"), and code residue (see
 * cleanSentence).
 */
function candidateSentences({ md, beforeBlock }) {
  const codes = [];
  const masked = md.replace(/`([^`]+)`/g, (_, code) => {
    codes.push(code);
    return `${CODE_OPEN}${codes.length - 1}${CODE_CLOSE}`;
  });
  const all = sentences(plainText(masked));
  return all
    .map((s, i) => {
      if (LEADIN_RE.test(s)) return trimLeadIn(s);
      // An unterminated last sentence right before a block introduces it.
      return beforeBlock && i === all.length - 1 && !TERMINATOR_RE.test(s) ? null : s;
    })
    .map(s => (s && !DEICTIC_RE.test(s) ? cleanSentence(s, codes) : null));
}

/** The fit sentences of a paragraph (see candidateSentences). */
const goodSentences = para => candidateSentences(para).filter(Boolean);

/**
 * A takeaway paragraph or list item as the run of fit sentences from its start;
 * empty when its first sentence is unfit, since what follows leans on it.
 */
function takeawayBlock(para) {
  const all = candidateSentences(para);
  const end = all.indexOf(null);
  return end === -1 ? all : all.slice(0, end);
}

/** Token bigrams: a Latin word or number is one token, every other letter (CJK) is one. */
function bigrams(s) {
  const tokens = s.toLowerCase().match(/[a-z0-9]+|[^\s\p{P}\p{S}a-z0-9]/gu) ?? [];
  return new Set(tokens.slice(1).map((t, i) => `${tokens[i]} ${t}`));
}

/** Near-duplicates ("最終整個資料庫被清空" / "最後整個資料庫仍被刪除"): high bigram overlap. */
function similar(a, b) {
  const A = bigrams(a);
  const B = bigrams(b);
  const min = Math.min(A.size, B.size);
  if (min < 3) return false;
  let common = 0;
  for (const g of A) if (B.has(g)) common++;
  return common / min >= DUP_OVERLAP;
}

/** Close a sentence that lacks a terminator: "。" after CJK, "." otherwise. */
const closeSentence = s =>
  !s || TERMINATOR_RE.test(s) ? s : s + (CJK_RE.test(s.at(-1)) ? "。" : ".");

/** Join sentences into one text; a trailing CJK fragment also gets its "。". */
function joinSentences(parts) {
  const text = parts.reduce((acc, p) => joinText(closeSentence(acc), p), "");
  return CJK_RE.test(text.at(-1) ?? "") ? closeSentence(text) : text;
}

/**
 * Build a meta description: problem sentences up to about PROBLEM_MIN chars,
 * then the first takeaway block whose headline fits (關鍵洞察 > 解法 > 原因),
 * then further problem sentences (placed before the takeaway) until
 * DESC_TARGET; a description still under DESC_MIN reads on within the takeaway
 * block. Whole sentences only, at most DESC_MAX chars, near-duplicates skipped.
 * @param {string[]} problemAll
 * @param {string[][]} takeaways sentence runs, one per paragraph or list item
 */
function buildDescription(problemAll, takeaways) {
  const problem = problemAll.filter((s, i) => !problemAll.slice(0, i).some(p => similar(p, s)));
  if (problem.length && len(problem[0]) > DESC_MAX) return cutSentence(problem[0]);
  const fits = parts => len(joinSentences(parts)) <= DESC_MAX;
  let n = Math.min(1, problem.length);
  while (
    n < problem.length &&
    len(joinSentences(problem.slice(0, n))) < PROBLEM_MIN &&
    fits(problem.slice(0, n + 1))
  )
    n++;
  // The takeaway outranks extra problem sentences: give some back if it does not fit.
  let head = problem.slice(0, n);
  let take;
  for (let k = n; k >= Math.min(1, n) && !take; k--) {
    const h = problem.slice(0, k);
    take = takeaways.find(([t]) => !h.some(p => similar(p, t)) && fits([...h, t]));
    if (take) head = h;
  }
  if (!take && !head.length) return takeaways.length ? cutSentence(takeaways[0][0]) : "";
  const tail = take ? [take[0]] : [];
  for (const s of problem.slice(head.length)) {
    if (len(joinSentences([...head, ...tail])) >= DESC_TARGET) break;
    if (tail.some(t => similar(t, s))) continue;
    if (!fits([...head, s, ...tail])) break;
    head.push(s);
  }
  for (const s of take?.slice(1) ?? []) {
    if (len(joinSentences([...head, ...tail])) >= DESC_MIN || !fits([...head, ...tail, s])) break;
    tail.push(s);
  }
  return joinSentences([...head, ...tail]);
}

/** Lines under each `## ` heading, keyed by the heading's plain text. */
function sections(lines) {
  const out = [];
  for (const line of lines) {
    const m = line.trim().match(/^##\s+(.+?)\s*#*$/);
    if (m) out.push({ name: plainText(m[1]), lines: [] });
    else out.at(-1)?.lines.push(line);
  }
  return out;
}

/**
 * @param {string} raw
 * @param {{ fallbackTitle?: string }} [opts]
 * @returns {{ title: string, date: string | null, body: string, description: string }}
 */
export function parseTil(raw, opts = {}) {
  const lines = raw.replace(/^﻿/, "").replace(/\r\n?/g, "\n").split("\n");
  let title = null;
  let date = null;
  let i = 0;

  while (i < lines.length && lines[i].trim() === "") i++;
  const h1 = lines[i]?.match(H1_RE);
  if (h1) {
    title = plainText(h1[1]);
    i++;
  }

  // The date line must sit right after the title (allowing blank lines).
  let j = i;
  while (j < lines.length && lines[j].trim() === "") j++;
  const dm = lines[j]?.trim().match(DATE_RE);
  if (dm) {
    date = dm[1];
    i = j + 1;
  }

  const bodyLines = lines.slice(i);
  while (bodyLines.length && bodyLines[0].trim() === "") bodyLines.shift();
  const body = bodyLines.join("\n");

  const finalTitle = title || opts.fallbackTitle || "Untitled";
  const override = raw.match(OVERRIDE_RE)?.[1].replace(/\s+/g, " ");
  const secs = sections(bodyLines);
  const sentencesOf = (ls, opt) => proseParagraphs(ls, opt).flatMap(goodSentences);
  const problemSec = secs.find(sec => PROBLEM_RE.test(sec.name));
  const problem = sentencesOf(problemSec ? problemSec.lines : bodyLines);
  const takeaways = TAKEAWAY_RES.flatMap(re =>
    secs
      .filter(sec => re.test(sec.name))
      .flatMap(sec =>
        proseParagraphs(sec.lines, { lists: re === TAKEAWAY_RES[0] })
          .map(takeawayBlock)
          .filter(b => b.length)
      )
  );
  let description = override || buildDescription(problem, takeaways);
  if (!override && len(description) < DESC_MIN) {
    description = cutSentence(
      description
        ? `${finalTitle}${CJK_RE.test(finalTitle.at(-1)) || CJK_RE.test(description[0]) ? "：" : ": "}${description}`
        : finalTitle
    );
  }

  return {
    title: finalTitle,
    date,
    body,
    description,
  };
}

/** URL slug from a filename: lowercase, CJK kept, everything else non-alnum → "-". */
export function tilSlug(fileName) {
  return fileName
    .replace(/\.mdx?$/i, "")
    .normalize("NFC")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "");
}
