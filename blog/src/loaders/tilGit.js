import { execFileSync } from "node:child_process";
import { readdirSync, realpathSync } from "node:fs";
import path from "node:path";
import { tilSlug } from "./parseTil.js";

/** Markdown notes under `dir`, skipping dot/underscore entries and README.md. */
export function walkTil(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap(d => {
    if (d.name.startsWith(".") || d.name.startsWith("_")) return [];
    const full = path.join(dir, d.name);
    if (d.isDirectory()) return walkTil(full);
    return /\.md$/i.test(d.name) && d.name.toLowerCase() !== "readme.md"
      ? [full]
      : [];
  });
}

function git(cwd, args) {
  try {
    return execFileSync("git", ["-c", "core.quotePath=false", ...args], {
      cwd,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });
  } catch {
    return null;
  }
}

/** Staged renames in the repo at `root`, new path → old path (repo-relative). */
function stagedRenames(root) {
  const map = new Map();
  const out = git(root, ["diff", "--cached", "-M", "--name-status"]) ?? "";
  for (const line of out.split("\n")) {
    const [status, from, to] = line.split("\t");
    if (status?.startsWith("R") && to) map.set(to, from);
  }
  return map;
}

/**
 * Author dates (ISO, newest first) of the commits that changed the file's
 * content, following renames. Pure renames (R100) are skipped so moving a note
 * to another folder doesn't touch its dates; a rename that is only staged is
 * resolved to the old path, whose history is the note's history.
 */
function gitContentDates(file) {
  let dir;
  try {
    // Resolve symlinks (e.g. /var → /private/var) so the path is inside `root`.
    dir = realpathSync(path.dirname(file));
  } catch {
    return [];
  }
  const root = git(dir, ["rev-parse", "--show-toplevel"])?.trim();
  if (!root) return [];
  let rel = path.relative(root, path.join(dir, path.basename(file)));
  rel = rel.split(path.sep).join("/");
  rel = stagedRenames(root).get(rel) ?? rel;
  const out = git(root, [
    "log",
    "--follow",
    "-M",
    "--format=%x01%aI",
    "--name-status",
    "--",
    rel,
  ]);
  if (!out) return [];
  return out
    .split("\x01")
    .map(chunk => chunk.trim().split("\n"))
    .filter(
      ([date, ...changes]) => date && !changes.some(c => /^R100\t/.test(c))
    )
    .map(([date]) => date);
}

/** Date the file was first committed (YYYY-MM-DD), or null if untracked. */
export function gitFirstCommitDate(file) {
  return gitContentDates(file).at(-1)?.slice(0, 10) ?? null;
}

/** ISO timestamp of the file's last content commit, or null if untracked. */
export function gitLastCommitDate(file) {
  return gitContentDates(file)[0] ?? null;
}

/** Post slug → last-commit ISO timestamp, for every tracked note under `dir`. */
export function tilLastModMap(dir) {
  const map = new Map();
  for (const file of walkTil(dir)) {
    const date = gitLastCommitDate(file);
    if (date) map.set(tilSlug(path.basename(file)), date);
  }
  return map;
}
