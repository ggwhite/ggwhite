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
  tilLastModMap,
} from "./tilGit.js";

const tilDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../til");

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
