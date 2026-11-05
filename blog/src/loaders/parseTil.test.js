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

test("description comes from first paragraph after 問題, markdown stripped", () => {
  const r = parseTil(zh);
  assert.equal(
    r.description,
    "自己寫的 Claude Code mod（jarvis，ui.render 畫 pane）在終端機正常，搬到 Claude Desktop 出現三種狀況："
  );
});

test("English Date line and Problem heading", () => {
  const r = parseTil(`# Codex Checkpoints\n\n**Date:** 2026-07-15\n\n## Problem\n\nA long task lost progress.\n\n## Cause\n\nx\n`);
  assert.equal(r.title, "Codex Checkpoints");
  assert.equal(r.date, "2026-07-15");
  assert.equal(r.description, "A long task lost progress.");
});

test("no date line and no problem heading: date null, first paragraph used", () => {
  const r = parseTil(`# T\n\nIntro para\nsecond line.\n\n## H\n\nmore\n`);
  assert.equal(r.date, null);
  assert.equal(r.description, "Intro para second line.");
  assert.ok(r.body.startsWith("Intro para"));
});

test("description truncated to ~120 chars", () => {
  const r = parseTil(`# T\n\n**日期：** 2026-01-01\n\n${"字".repeat(300)}\n`);
  assert.ok(r.description.length <= 121);
  assert.ok(r.description.endsWith("…"));
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
