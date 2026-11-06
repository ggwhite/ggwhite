import { readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import type { Loader } from "astro/loaders";
import { parseTil } from "./parseTil.js";
import { gitFirstCommitDate, gitLastCommitDate, tilEntries } from "./tilGit.js";

interface TilLoaderOptions {
  /** Directory holding the TIL markdown, relative to the Astro project root. */
  base: string;
  /** Category used for markdown sitting directly in `base`. */
  defaultCategory?: string;
}

/**
 * Content-layer loader for the repo's `til/` notes. The notes carry no
 * frontmatter: title comes from the H1, date from the `**日期：**` line
 * (fallback: first git commit, then file mtime), category from the folder.
 * `lastModified` is the file's last git commit, used only for SEO metadata
 * (article:modified_time, JSON-LD, sitemap lastmod) so list order and the
 * visible byline stay on the publish date.
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
        // Slugs (override or filename-derived) are validated and deduped here.
        const entries = tilEntries(baseDir);
        for (const { file, rel, slug: id, legacySlug } of entries) {
          const fileName = path.basename(file);
          const segments = rel.split(path.sep);
          const category =
            segments.length > 1 ? segments[0].toLowerCase() : defaultCategory;

          const raw = readFileSync(file, "utf8");
          const parsed = parseTil(raw, {
            fallbackTitle: fileName.replace(/\.md$/i, ""),
            source: rel,
          });
          let date = parsed.date ?? gitFirstCommitDate(file);
          if (!date) {
            date = statSync(file).mtime.toISOString().slice(0, 10);
            logger.warn(`${rel}: no date line or git history, using mtime`);
          } else if (!parsed.date) {
            logger.warn(`${rel}: no date line, using git date ${date}`);
          }

          const pubDatetime = new Date(`${date}T00:00:00+08:00`);
          const lastCommit = gitLastCommitDate(file);
          const lastModified =
            lastCommit && new Date(lastCommit) > pubDatetime
              ? new Date(lastCommit)
              : pubDatetime;

          const filePath = path.relative(root, file).split(path.sep).join("/");
          const data = await parseData({
            id,
            filePath,
            data: {
              title: parsed.title,
              pubDatetime,
              lastModified,
              description: parsed.description,
              category,
              tags: [category],
              ...(legacySlug ? { legacySlug } : {}),
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
        logger.info(`Loaded ${entries.length} TIL notes from ${base}`);
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
