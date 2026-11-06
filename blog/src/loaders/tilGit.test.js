import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  gitFirstCommitDate,
  gitLastCommitDate,
  tilEntries,
  tilLastModMap,
} from "./tilGit.js";

const tilDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../til"
);

test("gitLastCommitDate returns an ISO timestamp for a tracked file, null otherwise", () => {
  const map = tilLastModMap(tilDir);
  assert.ok(map.size > 0);
  for (const v of map.values()) assert.match(v, /^\d{4}-\d{2}-\d{2}T/);
  assert.equal(gitLastCommitDate("/nonexistent/x.md"), null);
});

/** Throwaway repo where every commit gets a fixed author/committer date. */
function tempRepo(t) {
  const dir = mkdtempSync(path.join(os.tmpdir(), "tilgit-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const git = (args, date) =>
    execFileSync(
      "git",
      [
        "-c",
        "user.name=t",
        "-c",
        "user.email=t@t",
        "-c",
        "commit.gpgsign=false",
        ...args,
      ],
      {
        cwd: dir,
        stdio: "ignore",
        env: date
          ? { ...process.env, GIT_AUTHOR_DATE: date, GIT_COMMITTER_DATE: date }
          : process.env,
      }
    );
  git(["init", "-q"]);
  return { dir, git };
}

test("moving a note keeps its first and last commit dates", t => {
  const { dir, git } = tempRepo(t);
  mkdirSync(path.join(dir, "general"));
  mkdirSync(path.join(dir, "shell"));
  const body =
    "# 標題 note\n\n" + "line of content that git can match on\n".repeat(20);
  writeFileSync(path.join(dir, "general", "zsh 筆記.md"), body);
  git(["add", "."]);
  git(["commit", "-qm", "add"], "2024-01-02T10:00:00+08:00");
  writeFileSync(path.join(dir, "general", "zsh 筆記.md"), body + "more\n");
  git(["commit", "-qam", "edit"], "2024-02-03T11:00:00+08:00");

  // Staged but not yet committed rename: the new path has no history of its own.
  git(["mv", "general/zsh 筆記.md", "shell/zsh 筆記.md"]);
  const moved = path.join(dir, "shell", "zsh 筆記.md");
  assert.equal(gitFirstCommitDate(moved), "2024-01-02");
  assert.equal(gitLastCommitDate(moved), "2024-02-03T11:00:00+08:00");

  // Committed pure rename: still not a content change.
  git(["commit", "-qm", "move"], "2024-03-04T12:00:00+08:00");
  assert.equal(gitFirstCommitDate(moved), "2024-01-02");
  assert.equal(gitLastCommitDate(moved), "2024-02-03T11:00:00+08:00");

  // A real edit after the move is the new last-modified date.
  writeFileSync(moved, body + "more\nand more\n");
  git(["commit", "-qam", "edit again"], "2024-04-05T13:00:00+08:00");
  assert.equal(gitFirstCommitDate(moved), "2024-01-02");
  assert.equal(gitLastCommitDate(moved), "2024-04-05T13:00:00+08:00");
});

test("commits marked [til-meta] don't change a note's dates", t => {
  const { dir, git } = tempRepo(t);
  const file = path.join(dir, "note.md");
  writeFileSync(file, "# 標題\n\n**日期：** 2024-01-02\n\nbody\n");
  git(["add", "."]);
  git(["commit", "-qm", "add"], "2024-01-02T10:00:00+08:00");
  writeFileSync(
    file,
    "# 標題\n\n**日期：** 2024-01-02\n<!-- slug: note -->\n\nbody\n"
  );
  git(
    ["commit", "-qam", "chore(til): add slugs [til-meta]"],
    "2024-05-06T10:00:00+08:00"
  );
  assert.equal(gitFirstCommitDate(file), "2024-01-02");
  assert.equal(gitLastCommitDate(file), "2024-01-02T10:00:00+08:00");
});

test("tilEntries uses a slug override and keeps the derived slug as legacy", t => {
  const dir = mkdtempSync(path.join(os.tmpdir(), "tilentries-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  mkdirSync(path.join(dir, "shell"));
  writeFileSync(
    path.join(dir, "shell", "zsh 筆記.md"),
    "# zsh 筆記\n\n**日期：** 2026-01-01\n<!-- slug: zsh-notes -->\n"
  );
  writeFileSync(path.join(dir, "plain-ascii.md"), "# Plain\n");
  const entries = tilEntries(dir).sort((a, b) => a.slug.localeCompare(b.slug));
  assert.deepEqual(
    entries.map(({ rel, slug, legacySlug }) => ({ rel, slug, legacySlug })),
    [
      { rel: "plain-ascii.md", slug: "plain-ascii", legacySlug: null },
      {
        rel: path.join("shell", "zsh 筆記.md"),
        slug: "zsh-notes",
        legacySlug: "zsh-筆記",
      },
    ]
  );
});

test("tilEntries rejects a slug override that duplicates another post's slug", t => {
  const dir = mkdtempSync(path.join(os.tmpdir(), "tilentries-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  writeFileSync(path.join(dir, "taken.md"), "# Taken\n");
  writeFileSync(path.join(dir, "中文.md"), "# 中文\n<!-- slug: taken -->\n");
  assert.throws(() => tilEntries(dir), /duplicate slug "taken"/);
});

test("tilEntries rejects two files deriving the same slug", t => {
  const dir = mkdtempSync(path.join(os.tmpdir(), "tilentries-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  mkdirSync(path.join(dir, "a"));
  writeFileSync(path.join(dir, "a", "same.md"), "# A\n");
  writeFileSync(path.join(dir, "Same.md"), "# B\n");
  assert.throws(() => tilEntries(dir), /duplicate slug "same"/);
});

test("tilEntries rejects an override that equals another post's old slug", t => {
  const dir = mkdtempSync(path.join(os.tmpdir(), "tilentries-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  writeFileSync(path.join(dir, "old-x.md"), "# X\n<!-- slug: new-x -->\n");
  writeFileSync(path.join(dir, "y.md"), "# Y\n<!-- slug: old-x -->\n");
  assert.throws(() => tilEntries(dir), /slug "old-x"/);
});

test("tilLastModMap is keyed by the override slug", t => {
  const { dir, git } = tempRepo(t);
  writeFileSync(
    path.join(dir, "zsh 筆記.md"),
    "# zsh\n<!-- slug: zsh-notes -->\n"
  );
  git(["add", "."]);
  git(["commit", "-qm", "add"], "2024-01-02T10:00:00+08:00");
  assert.deepEqual(
    [...tilLastModMap(dir).entries()],
    [["zsh-notes", "2024-01-02T10:00:00+08:00"]]
  );
});
