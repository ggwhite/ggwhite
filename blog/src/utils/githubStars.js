/**
 * Live GitHub repo stats (stars, archived) for the projects page.
 *
 * Plain JS so `node --test` can run it without a TypeScript loader.
 * Every failure (offline, rate limit, bad payload) resolves to `null`, so the
 * build falls back to the static numbers in src/data/projects.ts.
 */

const DEFAULT_API_BASE = "https://api.github.com";
const TIMEOUT_MS = 8000;

/**
 * @param {{ user: string, token?: string, apiBase?: string, fetch?: typeof fetch }} opts
 * @returns {Promise<Map<string, { stars: number, archived: boolean }> | null>}
 */
export async function fetchRepoStats({
  user,
  token,
  apiBase = DEFAULT_API_BASE,
  fetch: fetchImpl = globalThis.fetch,
}) {
  const url = `${apiBase.replace(/\/+$/, "")}/users/${user}/repos?per_page=100`;
  const headers = {
    Accept: "application/vnd.github+json",
    "User-Agent": "ggwhite-blog-build",
  };
  if (token) headers.Authorization = `Bearer ${token}`;

  try {
    const res = await fetchImpl(url, {
      headers,
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) {
      console.warn(`[projects] GitHub API ${res.status}; using fallback stars`);
      return null;
    }
    const repos = await res.json();
    if (!Array.isArray(repos)) {
      console.warn("[projects] unexpected GitHub API payload; using fallback");
      return null;
    }
    return new Map(
      repos.map(r => [
        r.name,
        { stars: r.stargazers_count, archived: Boolean(r.archived) },
      ])
    );
  } catch (err) {
    console.warn(`[projects] GitHub API unreachable (${err}); using fallback`);
    return null;
  }
}

/**
 * Overlay live stats onto the static project list. Projects missing from the
 * live data keep their static values; a static `archived: true` always wins,
 * since a project can be frozen without being archived on GitHub.
 *
 * @template {{ name: string, stars: number, archived?: boolean }} T
 * @param {T[]} projects
 * @param {Map<string, { stars: number, archived: boolean }> | null} live
 * @returns {T[]}
 */
export function mergeRepoStats(projects, live) {
  if (!live) return projects;
  return projects.map(p => {
    const s = live.get(p.name);
    if (!s) return p;
    return { ...p, stars: s.stars, archived: Boolean(p.archived || s.archived) };
  });
}
