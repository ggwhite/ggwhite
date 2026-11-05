import { test } from "node:test";
import assert from "node:assert/strict";
import {
  absoluteUrl,
  ogLocale,
  detectLang,
  personSchema,
  websiteSchema,
  breadcrumbSchema,
  blogPostingSchema,
  projectsItemListSchema,
  toJsonLd,
} from "./seo.js";
import { getRelatedPosts } from "./relatedPosts.js";
import { rehypeExternalLinks } from "./rehypeExternalLinks.js";

const site = {
  origin: "https://ggwhite.github.io",
  base: "/ggwhite/",
  title: "White's Tech Notes",
  description: "desc",
  author: "White",
};

test("absoluteUrl adds origin + base once, keeps trailing slash", () => {
  assert.equal(absoluteUrl(site, "posts/a/"), "https://ggwhite.github.io/ggwhite/posts/a/");
  assert.equal(absoluteUrl(site, "/ggwhite/posts/a/"), "https://ggwhite.github.io/ggwhite/posts/a/");
  assert.equal(absoluteUrl(site, ""), "https://ggwhite.github.io/ggwhite/");
  assert.equal(absoluteUrl(site, "https://x.y/z"), "https://x.y/z");
});

test("ogLocale and detectLang", () => {
  assert.equal(ogLocale("zh-Hant"), "zh_TW");
  assert.equal(ogLocale("en"), "en_US");
  assert.equal(detectLang("Claude Desktop 畫 mod 的坑"), "zh-Hant");
  assert.equal(detectLang("Codex Checkpoints", "A long task lost progress."), "en");
});

test("Person schema has the required identity fields", () => {
  const p = personSchema(site, {
    sameAs: ["https://github.com/ggwhite", "https://www.linkedin.com/in/white-chang/"],
  });
  assert.equal(p["@type"], "Person");
  assert.equal(p.name, "White");
  assert.equal(p.alternateName, "ggwhite");
  assert.equal(p.url, "https://ggwhite.github.io/ggwhite/about/");
  assert.equal(p.jobTitle, "Senior Backend Engineer");
  assert.ok(p.knowsAbout.includes("Go"));
  assert.equal(p.sameAs.length, 2);
});

test("WebSite schema includes SearchAction only when asked", () => {
  const w = websiteSchema(site, { search: true });
  assert.equal(w.url, "https://ggwhite.github.io/ggwhite/");
  assert.equal(w.potentialAction["@type"], "SearchAction");
  assert.equal(
    w.potentialAction.target.urlTemplate,
    "https://ggwhite.github.io/ggwhite/search/?q={search_term_string}"
  );
  assert.equal(w.potentialAction["query-input"], "required name=search_term_string");
  assert.equal(websiteSchema(site, { search: false }).potentialAction, undefined);
});

test("BreadcrumbList positions start at 1 with absolute item URLs", () => {
  const b = breadcrumbSchema(site, [
    { name: "Home", path: "" },
    { name: "Tags", path: "tags/" },
    { name: "golang", path: "tags/golang/" },
  ]);
  assert.equal(b["@type"], "BreadcrumbList");
  assert.deepEqual(
    b.itemListElement.map(i => [i.position, i.item]),
    [
      [1, "https://ggwhite.github.io/ggwhite/"],
      [2, "https://ggwhite.github.io/ggwhite/tags/"],
      [3, "https://ggwhite.github.io/ggwhite/tags/golang/"],
    ]
  );
});

test("BlogPosting carries headline, dates, author, language, keywords, page and image", () => {
  const b = blogPostingSchema(site, {
    title: "T",
    description: "D",
    url: "https://ggwhite.github.io/ggwhite/posts/t/",
    image: "https://ggwhite.github.io/ggwhite/posts/t/index.png",
    datePublished: new Date("2026-01-01T00:00:00+08:00"),
    dateModified: new Date("2026-02-01T00:00:00+08:00"),
    tags: ["golang"],
    lang: "zh-Hant",
  });
  assert.equal(b["@type"], "BlogPosting");
  assert.equal(b.headline, "T");
  assert.equal(b.datePublished, "2025-12-31T16:00:00.000Z");
  assert.equal(b.dateModified, "2026-01-31T16:00:00.000Z");
  assert.equal(b.author["@type"], "Person");
  assert.equal(b.inLanguage, "zh-Hant");
  assert.equal(b.keywords, "golang");
  assert.equal(b.mainEntityOfPage["@id"], "https://ggwhite.github.io/ggwhite/posts/t/");
  assert.equal(b.image, "https://ggwhite.github.io/ggwhite/posts/t/index.png");
  assert.equal(b.publisher["@type"], "Person");
});

test("projects ItemList of SoftwareSourceCode", () => {
  const l = projectsItemListSchema(site, [
    { name: "go-masker", pitch: "Mask it.", language: "Go", homepage: { url: "https://godoc.org/x" } },
    { name: "jarvis", pitch: "HUD.", language: "TypeScript" },
  ]);
  assert.equal(l["@type"], "ItemList");
  assert.equal(l.itemListElement.length, 2);
  const first = l.itemListElement[0];
  assert.equal(first.position, 1);
  assert.equal(first.item["@type"], "SoftwareSourceCode");
  assert.equal(first.item.codeRepository, "https://github.com/ggwhite/go-masker");
  assert.equal(first.item.programmingLanguage, "Go");
  assert.equal(first.item.url, "https://godoc.org/x");
  assert.equal(l.itemListElement[1].item.url, "https://github.com/ggwhite/jarvis");
});

test("toJsonLd wraps in @context and escapes '<'", () => {
  const s = toJsonLd([{ "@type": "Thing", name: "</script>" }]);
  assert.ok(!s.includes("</script>"));
  const parsed = JSON.parse(s);
  assert.equal(parsed["@context"], "https://schema.org");
  assert.equal(parsed["@graph"][0].name, "</script>");
});

test("related posts: same tag, newest first, excludes self, max 3", () => {
  const mk = (id, tag, d) => ({ id, data: { tags: [tag], pubDatetime: new Date(d) } });
  const all = [
    mk("a", "go", "2026-01-01"),
    mk("b", "go", "2026-03-01"),
    mk("c", "go", "2026-02-01"),
    mk("d", "java", "2026-04-01"),
    mk("e", "go", "2026-05-01"),
    mk("f", "go", "2026-06-01"),
  ];
  assert.deepEqual(getRelatedPosts(all[0], all).map(p => p.id), ["f", "e", "b"]);
  assert.deepEqual(getRelatedPosts(all[3], all).map(p => p.id), []);
});

test("rehypeExternalLinks adds rel=noopener to external links only", () => {
  const a = href => ({ type: "element", tagName: "a", properties: { href }, children: [] });
  const tree = {
    type: "root",
    children: [a("https://github.com/ggwhite/go-masker"), a("/ggwhite/posts/x/"), a("#h"), a("https://ggwhite.github.io/ggwhite/about/")],
  };
  rehypeExternalLinks({ siteHost: "ggwhite.github.io" })(tree);
  const rels = tree.children.map(n => n.properties.rel);
  assert.deepEqual(rels[0], ["noopener"]);
  assert.equal(rels[1], undefined);
  assert.equal(rels[2], undefined);
  assert.equal(rels[3], undefined);
});
