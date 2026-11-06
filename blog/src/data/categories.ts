/**
 * Post categories. A post's category is the til/ folder it sits in, so the
 * slug is the folder name. A folder missing here (e.g. one save-til just
 * created) still builds: it falls back to the folder name with no blurb.
 *
 * Kept free of imports so node --test can load it directly.
 */

export interface CategoryMeta {
  label: string;
  /** One English line shown on the categories index and in meta descriptions. */
  blurb: string;
  /** Short Traditional Chinese line. */
  blurbZh: string;
}

export interface Category extends CategoryMeta {
  slug: string;
}

export const CATEGORIES: Record<string, CategoryMeta> = {
  "ai-agents": {
    label: "AI Agents",
    blurb:
      "Claude Code, Codex and LLM tooling: prompts, permissions, mods and agent workflows.",
    blurbZh:
      "Claude Code、Codex 與 LLM 工具的實戰坑：prompt、權限、mod、agent 流程。",
  },
  shell: {
    label: "Shell",
    blurb: "Bash, zsh, cron and process quirks that break scripts silently.",
    blurbZh: "Bash、zsh、cron 與行程的怪癖，讓腳本靜默壞掉的那種。",
  },
  macos: {
    label: "macOS",
    blurb: "macOS-specific traps: iCloud Drive, Keychain, AppleScript, bsdtar.",
    blurbZh: "macOS 專屬的坑：iCloud Drive、Keychain、AppleScript、bsdtar。",
  },
  practices: {
    label: "Engineering Practices",
    blurb:
      "Lessons on design, testing and data handling that apply to any language.",
    blurbZh: "跨語言通用的設計、測試與資料處理心得。",
  },
  database: {
    label: "Database",
    blurb: "MongoDB, Redis and SQLite: queries, encoding and transactions.",
    blurbZh: "MongoDB、Redis、SQLite 的查詢、編碼與交易問題。",
  },
  devops: {
    label: "DevOps",
    blurb: "Docker, Compose, object storage and release pipelines.",
    blurbZh: "Docker、Compose、物件儲存與發版流程。",
  },
  media: {
    label: "Media",
    blurb: "ffmpeg, TTS and video rendering pitfalls.",
    blurbZh: "ffmpeg、TTS 與影片算圖的坑。",
  },
  golang: {
    label: "Go",
    blurb: "Go modules, release tags and CLI libraries.",
    blurbZh: "Go module、發版 tag 與 CLI 函式庫。",
  },
  lua: {
    label: "Lua",
    blurb: "Lua and Roblox Studio development notes.",
    blurbZh: "Lua 與 Roblox Studio 開發筆記。",
  },
  java: {
    label: "Java",
    blurb: "Java and Spring runtime behaviour.",
    blurbZh: "Java 與 Spring 的執行期行為。",
  },
  security: {
    label: "Security",
    blurb: "Attacks seen in production and how they were defended.",
    blurbZh: "線上遇到的攻擊手法與防禦嘗試。",
  },
};

/** Category for a folder name; unknown folders fall back to the name itself. */
export function getCategory(slug: string): Category {
  const meta = CATEGORIES[slug];
  return meta
    ? { slug, ...meta }
    : { slug, label: slug, blurb: "", blurbZh: "" };
}

/** Categories present in `slugs` with post counts, most posts first. */
export function countCategories(
  slugs: string[]
): (Category & { count: number })[] {
  const counts = new Map<string, number>();
  for (const s of slugs) counts.set(s, (counts.get(s) ?? 0) + 1);
  return [...counts]
    .map(([slug, count]) => ({ ...getCategory(slug), count }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
}

/**
 * Old /tags/ listing pages (folder-as-tag era) → their category page.
 * `general` was split up, so it lands on the categories index.
 */
const LEGACY_TAGS: Record<string, { to: string | null; pages: number }> = {
  golang: { to: "golang", pages: 1 },
  java: { to: "java", pages: 1 },
  lua: { to: "lua", pages: 1 },
  devops: { to: "devops", pages: 2 },
  database: { to: "database", pages: 1 },
  general: { to: null, pages: 3 },
};

/** Base-relative paths, e.g. { from: "tags/devops/2/", to: "categories/devops/" }. */
export function legacyTagRedirects(): { from: string; to: string }[] {
  return [
    { from: "tags/", to: "categories/" },
    ...Object.entries(LEGACY_TAGS).flatMap(([tag, { to, pages }]) =>
      Array.from({ length: pages }, (_, i) => ({
        from: `tags/${tag}/${i > 0 ? `${i + 1}/` : ""}`,
        to: to ? `categories/${to}/` : "categories/",
      }))
    ),
  ];
}
