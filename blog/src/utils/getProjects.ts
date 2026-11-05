import { GITHUB_USER, projects, type Project } from "@/data/projects";
import { fetchRepoStats, mergeRepoStats } from "./githubStars.js";

let cached: Promise<Project[]> | undefined;

/**
 * Projects with live star counts, fetched once per build.
 *
 * Env:
 * - GITHUB_TOKEN: optional, raises the API rate limit (set in CI).
 * - GITHUB_API_URL: override the API host; point it at an unreachable host to
 *   test the offline fallback.
 * - PROJECTS_OFFLINE=1: skip the fetch and use the static stars.
 */
export function getProjects(): Promise<Project[]> {
  cached ??= (async () => {
    if (process.env.PROJECTS_OFFLINE === "1") return projects;
    const live = await fetchRepoStats({
      user: GITHUB_USER,
      token: process.env.GITHUB_TOKEN,
      apiBase: process.env.GITHUB_API_URL,
    });
    return mergeRepoStats(projects, live);
  })();
  return cached;
}
