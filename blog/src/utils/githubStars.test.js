import { test } from "node:test";
import assert from "node:assert/strict";
import { fetchRepoStats, mergeRepoStats } from "./githubStars.js";

const projects = [
  { name: "go-masker", stars: 100 },
  { name: "4x", stars: 30, archived: false },
  { name: "loupe", stars: 0 },
];

test("mergeRepoStats overrides stars and archived from live data", () => {
  const live = new Map([
    ["go-masker", { stars: 131, archived: false }],
    ["4x", { stars: 36, archived: true }],
  ]);
  const merged = mergeRepoStats(projects, live);
  assert.equal(merged[0].stars, 131);
  assert.equal(merged[1].stars, 36);
  assert.equal(merged[1].archived, true);
  // Not in the live data: keeps the static fallback.
  assert.equal(merged[2].stars, 0);
  // Input is not mutated.
  assert.equal(projects[0].stars, 100);
});

test("mergeRepoStats keeps a static archived flag when live says false", () => {
  const live = new Map([["4x", { stars: 36, archived: false }]]);
  const merged = mergeRepoStats(
    [{ name: "4x", stars: 30, archived: true }],
    live
  );
  assert.equal(merged[0].archived, true);
});

test("mergeRepoStats with null live data returns the fallback", () => {
  const merged = mergeRepoStats(projects, null);
  assert.deepEqual(merged, projects);
});

test("fetchRepoStats maps the GitHub API response and sends the token", async () => {
  let seen;
  const fakeFetch = async (url, init) => {
    seen = { url, init };
    return {
      ok: true,
      json: async () => [
        { name: "go-masker", stargazers_count: 131, archived: false },
        { name: "4x", stargazers_count: 36, archived: true },
      ],
    };
  };
  const stats = await fetchRepoStats({
    user: "ggwhite",
    token: "t0k",
    apiBase: "https://api.example.test",
    fetch: fakeFetch,
  });
  assert.equal(
    seen.url,
    "https://api.example.test/users/ggwhite/repos?per_page=100"
  );
  assert.equal(seen.init.headers.Authorization, "Bearer t0k");
  assert.deepEqual(stats.get("go-masker"), { stars: 131, archived: false });
  assert.deepEqual(stats.get("4x"), { stars: 36, archived: true });
});

test("fetchRepoStats returns null on a non-OK response", async () => {
  const stats = await fetchRepoStats({
    user: "ggwhite",
    fetch: async () => ({ ok: false, status: 403, json: async () => ({}) }),
  });
  assert.equal(stats, null);
});

test("fetchRepoStats returns null when fetch throws", async () => {
  const stats = await fetchRepoStats({
    user: "ggwhite",
    fetch: async () => {
      throw new Error("ENOTFOUND");
    },
  });
  assert.equal(stats, null);
});

test("fetchRepoStats returns null on an unexpected payload", async () => {
  const stats = await fetchRepoStats({
    user: "ggwhite",
    fetch: async () => ({ ok: true, json: async () => ({ message: "x" }) }),
  });
  assert.equal(stats, null);
});
