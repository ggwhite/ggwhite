import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import type { Loader } from "astro/loaders";
import { parseTil, tilSlug } from "./parseTil.js";

interface TilLoaderOptions {
  /** Directory holding the TIL markdown, relative to the Astro project root. */
  base: string;
  /** Category used for markdown sitting directly in `base`. */
  defaultCategory?: string;
}

function walk(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap(d => {
    if (d.name.startsWith(".") || d.name.startsWith("_")) return [];
    const full = path.join(dir, d.name);
    if (d.isDirectory()) return walk(full);
    return /\.md$/i.test(d.name) && d.name.toLowerCase() !== "readme.md"
      ? [full]
      : [];
  });
}

/** Date the file was first committed (YYYY-MM-DD), or null if untracked. */
function gitFirstCommitDate(file: string): string | null {
  try {
    const out = execFileSync(
      "git",
      ["log", "--follow", "--diff-filter=A", "--format=%as", "--", file],
      { cwd: path.dirname(file), encoding: "utf8" }
    ).trim();
    const lines = out.split("\n").filter(Boolean);
    return lines.at(-1) ?? null;
  } catch {
    return null;
  }
}

/**
 * Content-layer loader for the repo's `til/` notes. The notes carry no
 * frontmatter: title comes from the H1, date from the `**日期：**` line
 * (fallback: first git commit, then file mtime), category from the folder.
 */
export function tilLoader({
  base,
  defaultCategory = "general",
}: TilLoaderOptions): Loader {
  return {
    name: "til-loader",
    load: async ({
      config,
      store,
      parseData,
      renderMarkdown,
      generateDigest,
      logger,
      watcher,
    }) => {
      const root = fileURLToPath(config.root);
      const baseDir = path.resolve(root, base);

      const loadAll = async () => {
        store.clear();
        const seen = new Map<string, string>();
        for (const file of walk(baseDir)) {
          const rel = path.relative(baseDir, file);
          const fileName = path.basename(file);
          const segments = rel.split(path.sep);
          const category =
            segments.length > 1 ? segments[0].toLowerCase() : defaultCategory;
          const id = tilSlug(fileName);

          if (seen.has(id)) {
            throw new Error(
              `til-loader: duplicate slug "${id}" for ${rel} and ${seen.get(id)}`
            );
          }
          seen.set(id, rel);

          const raw = readFileSync(file, "utf8");
          const parsed = parseTil(raw, {
            fallbackTitle: fileName.replace(/\.md$/i, ""),
          });
          let date = parsed.date ?? gitFirstCommitDate(file);
          if (!date) {
            date = statSync(file).mtime.toISOString().slice(0, 10);
            logger.warn(`${rel}: no date line or git history, using mtime`);
          } else if (!parsed.date) {
            logger.warn(`${rel}: no date line, using git date ${date}`);
          }

          const filePath = path.relative(root, file).split(path.sep).join("/");
          const data = await parseData({
            id,
            filePath,
            data: {
              title: parsed.title,
              pubDatetime: new Date(`${date}T00:00:00+08:00`),
              description: parsed.description,
              tags: [category],
            },
          });
          store.set({
            id,
            data,
            body: parsed.body,
            filePath,
            digest: generateDigest(raw),
            rendered: await renderMarkdown(parsed.body, {
              fileURL: pathToFileURL(file),
            }),
          });
        }
        logger.info(`Loaded ${seen.size} TIL notes from ${base}`);
      };

      await loadAll();

      watcher?.add(baseDir);
      watcher?.on("all", async (_event, changed) => {
        if (changed.startsWith(baseDir) && /\.md$/i.test(changed)) {
          await loadAll();
        }
      });
    },
  };
}
