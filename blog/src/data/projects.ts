/**
 * Public GitHub projects shown on /projects and the home page.
 *
 * `stars` is the fallback count used when the build cannot reach the GitHub
 * API; src/utils/getProjects.ts overlays live numbers at build time.
 * Pitches are written from each repo's README — do not add features that are
 * not there.
 */

export type ProjectTier = "featured" | "more" | "earlier";

export interface Project {
  /** Repo name under github.com/ggwhite. */
  name: string;
  tier: ProjectTier;
  /** One or two English sentences: what it solves, for whom. */
  pitch: string;
  /** Short Traditional Chinese line. */
  pitchZh: string;
  language: string;
  /** Fallback star count (snapshot 2026-11-05). */
  stars: number;
  /** Archived or frozen. A static `true` wins over the live API value. */
  archived?: boolean;
  /** Shown instead of the pitch footer when archived. */
  archivedNote?: string;
  homepage?: { label: string; url: string };
  /** Install one-liner copied from the README. */
  install?: string;
}

export const GITHUB_USER = "ggwhite";

export const repoUrl = (name: string) =>
  `https://github.com/${GITHUB_USER}/${name}`;

export const projects: Project[] = [
  {
    name: "go-masker",
    tier: "featured",
    pitch:
      "Keep passwords, emails, IDs and card numbers out of your logs. Tag Go struct fields with `mask:\"...\"` and get a masked copy or a log-ready string, with custom maskers when the built-ins are not enough.",
    pitchZh: "用 struct tag 遮罩 Go 結構裡的敏感資料，log 不再外洩個資。",
    language: "Go",
    stars: 130,
    homepage: {
      label: "GoDoc",
      url: "https://godoc.org/github.com/ggwhite/go-masker",
    },
    install: "go get -u github.com/ggwhite/go-masker/v3",
  },
  {
    name: "memory-mcp",
    tier: "featured",
    pitch:
      "AI coding agents forget everything when a session ends. memory-mcp gives them durable, searchable memory in one Go binary and one SQLite file — usable from the CLI, as an MCP server, or via Claude Code hooks, with CJK-ready full-text search.",
    pitchZh: "讓 AI coding agent 跨 session 記得踩過的坑與你的偏好，單一執行檔、支援中文搜尋。",
    language: "Go",
    stars: 1,
    install: "go install github.com/ggwhite/memory-mcp@latest",
  },
  {
    name: "jarvis",
    tier: "featured",
    pitch:
      "A Claude Code mod that opens a live HUD beside the chat: what your subagents are doing, what they cost, which files changed, and every other session on the machine. It also turns repeated bad dispatch outcomes into rules — only the ones you approve.",
    pitchZh: "Claude Code 的即時儀表板：subagent 進度、花費、檔案變更，還會從失敗中學出規則。",
    language: "TypeScript",
    stars: 0,
    install: "git clone https://github.com/ggwhite/jarvis.git ~/github/jarvis",
  },
  {
    name: "4x",
    tier: "featured",
    pitch:
      "A CLI that runs AI coding agents as separate Design, Code, Review and Test roles, with guardrails (state machine, scope lock, evidence-based test gate) enforced in Go rather than by prompting.",
    pitchZh: "把 AI 開發拆成設計、實作、審查、測試四個隔離角色，用確定性的護欄把關。",
    language: "Go",
    stars: 35,
    archived: true,
    archivedNote:
      "An experiment, now frozen. Its principles — role isolation and deterministic guardrails over prompting — live on in how I run coding agents today.",
    homepage: { label: "Docs", url: "https://ggwhite.github.io/4x/" },
    install: "brew install ggwhite/tap/fourx",
  },
  {
    name: "loupe",
    tier: "more",
    pitch:
      "Claude Code transcripts only show `[Image #1]`. loupe draws image thumbnails inline and opens any of them in a full-screen terminal viewer with real-pixel zoom and pan (macOS, kitty-graphics terminals such as herdr).",
    pitchZh: "在終端機的 Claude Code 對話裡直接看圖，全螢幕、可放大到看清小字。",
    language: "TypeScript",
    stars: 0,
    install: "git clone https://github.com/ggwhite/loupe.git ~/src/loupe",
  },
  {
    name: "share-html",
    tier: "more",
    pitch:
      "A Claude Code skill that generates self-contained, single-file HTML reports — double-click to open, drag to share, no build step or server. Several template styles with interactive tables, charts and kanban boards.",
    pitchZh: "讓 Claude 產出單一 HTML 檔的報告，雙擊即開、直接分享。",
    language: "HTML",
    stars: 1,
    install: "npx skills add ggwhite/share-html",
  },
  {
    name: "go-hessian",
    tier: "earlier",
    pitch:
      "A Hessian proxy for Go: call Java Hessian services from Go by method name.",
    pitchZh: "用 Go 呼叫 Java Hessian 服務。",
    language: "Go",
    stars: 7,
  },
  {
    name: "simple-hessian-server",
    tier: "earlier",
    pitch:
      "A small Spring Boot Hessian server used to test go-hessian against a real Java service.",
    pitchZh: "給 go-hessian 測試用的 Java Hessian 服務。",
    language: "Java",
    stars: 0,
  },
];
