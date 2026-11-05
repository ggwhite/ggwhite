import { execFileSync } from "node:child_process";
import { readdirSync } from "node:fs";
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

function gitLog(file, args) {
  try {
    return execFileSync("git", ["log", ...args, "--", file], {
      cwd: path.dirname(file),
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    })
      .trim()
      .split("\n")
      .filter(Boolean);
  } catch {
    return [];
  }
}

/** Date the file was first committed (YYYY-MM-DD), or null if untracked. */
export function gitFirstCommitDate(file) {
  return gitLog(file, ["--follow", "--diff-filter=A", "--format=%as"]).at(-1) ?? null;
}

/** ISO timestamp of the file's last commit, or null if untracked. */
export function gitLastCommitDate(file) {
  return gitLog(file, ["-1", "--format=%aI"])[0] ?? null;
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
