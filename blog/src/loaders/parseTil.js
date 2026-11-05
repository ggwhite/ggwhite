// Parse a TIL markdown file that has no frontmatter:
//   # Title
//   **日期：** YYYY-MM-DD   (or **Date:** YYYY-MM-DD)
//   body...

const H1_RE = /^#\s+(.+?)\s*#*\s*$/;
const DATE_RE =
  /^\*\*\s*(?:日期|Date)\s*[：:]?\s*\*\*\s*[：:]?\s*(\d{4}-\d{2}-\d{2})\s*$/i;
const PROBLEM_RE = /^##\s+(?:問題|Problem)\s*$/i;
const DESC_MAX = 120;

/** Strip inline markdown so the text reads cleanly in cards and meta tags. */
function plainText(md) {
  return md
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/`([^`]*)`/g, "$1")
    .replace(/(\*\*|__)(.*?)\1/g, "$2")
    .replace(/(^|[^*])\*([^*\s][^*]*)\*/g, "$1$2")
    .replace(/<[^>]+>/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** First prose paragraph in `lines` (skips headings, fences, tables, rules). */
function firstParagraph(lines) {
  let inFence = false;
  let buf = [];
  for (const line of lines) {
    const t = line.trim();
    if (t.startsWith("```") || t.startsWith("~~~")) {
      if (buf.length) break;
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;
    if (t === "") {
      if (buf.length) break;
      continue;
    }
    if (/^#{1,6}\s/.test(t) || /^\|/.test(t) || /^([-*_])\1{2,}$/.test(t)) {
      if (buf.length) break;
      continue;
    }
    buf.push(t.replace(/^([-*+]|\d+\.)\s+/, "").replace(/^>\s?/, ""));
  }
  return plainText(buf.join(" "));
}

function truncate(s, max = DESC_MAX) {
  const chars = [...s];
  return chars.length > max ? chars.slice(0, max).join("").trimEnd() + "…" : s;
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

  const pIdx = bodyLines.findIndex(l => PROBLEM_RE.test(l.trim()));
  let description = pIdx >= 0 ? firstParagraph(bodyLines.slice(pIdx + 1)) : "";
  if (!description) description = firstParagraph(bodyLines);

  return {
    title: title || opts.fallbackTitle || "Untitled",
    date,
    body,
    description: truncate(description || title || ""),
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
