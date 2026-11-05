import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { gitLastCommitDate, tilLastModMap } from "./tilGit.js";

const tilDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../til");

test("gitLastCommitDate returns an ISO timestamp for a tracked file, null otherwise", () => {
  const map = tilLastModMap(tilDir);
  assert.ok(map.size > 0);
  for (const v of map.values()) assert.match(v, /^\d{4}-\d{2}-\d{2}T/);
  assert.equal(gitLastCommitDate("/nonexistent/x.md"), null);
});
