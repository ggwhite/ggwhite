import { test } from "node:test";
import assert from "node:assert/strict";
import {
  CATEGORIES,
  countCategories,
  getCategory,
  legacyTagRedirects,
} from "./categories.ts";

test("known folders get their display label and blurb", () => {
  assert.equal(getCategory("ai-agents").label, "AI Agents");
  assert.equal(getCategory("macos").label, "macOS");
  assert.equal(getCategory("golang").label, "Go");
  assert.equal(getCategory("practices").label, "Engineering Practices");
  for (const slug of Object.keys(CATEGORIES)) {
    const c = getCategory(slug);
    assert.equal(c.slug, slug);
    assert.ok(c.blurb.length > 0 && c.blurbZh.length > 0, slug);
  }
  assert.equal(Object.keys(CATEGORIES).length, 11);
});

test("an unknown folder falls back to its name", () => {
  assert.deepEqual(getCategory("rust"), {
    slug: "rust",
    label: "rust",
    blurb: "",
    blurbZh: "",
  });
});

test("countCategories sorts by post count, then label", () => {
  const counts = countCategories([
    "lua",
    "shell",
    "java",
    "shell",
    "rust",
    "lua",
    "shell",
  ]);
  assert.deepEqual(
    counts.map(c => [c.slug, c.count]),
    [
      ["shell", 3],
      ["lua", 2],
      ["java", 1],
      ["rust", 1],
    ]
  );
  assert.equal(counts[0].label, "Shell");
});

test("old tag URLs redirect to the matching category, general to the index", () => {
  const map = Object.fromEntries(legacyTagRedirects().map(r => [r.from, r.to]));
  assert.equal(map["tags/"], "categories/");
  assert.equal(map["tags/general/"], "categories/");
  assert.equal(map["tags/general/3/"], "categories/");
  for (const t of ["golang", "java", "lua", "devops", "database"]) {
    assert.equal(map[`tags/${t}/`], `categories/${t}/`);
    assert.ok(t in CATEGORIES);
  }
  assert.equal(map["tags/devops/2/"], "categories/devops/");
});
