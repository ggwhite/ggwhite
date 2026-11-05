// Pure helpers for SEO meta and schema.org JSON-LD. Plain JS so node --test
// can exercise them without Astro; pages pass in the resolved site info.

/**
 * @typedef {{ origin: string, base: string, title: string, description: string, author: string }} SeoSite
 */

/** Absolute URL for a path. Paths already starting with the base are not prefixed twice. */
export function absoluteUrl(site, path = "") {
  if (/^https?:\/\//.test(path)) return path;
  const base = site.base.replace(/\/?$/, "/");
  const rel = path.startsWith(base) ? path : base + path.replace(/^\/+/, "");
  return new URL(rel, site.origin).href;
}

const HAN_RE = /\p{Script=Han}/u;

/** "zh-Hant" when any of the texts contains Han characters, else "en". */
export function detectLang(...texts) {
  return texts.some(t => t && HAN_RE.test(t)) ? "zh-Hant" : "en";
}

/** BCP 47 page language → Open Graph locale. */
export function ogLocale(lang) {
  return lang.startsWith("zh") ? "zh_TW" : "en_US";
}

const KNOWS_ABOUT = [
  "Go",
  "Java",
  "Lua",
  "Skynet",
  "Redis",
  "MongoDB",
  "MySQL",
  "Docker",
  "High-concurrency backend systems",
  "Game server development",
  "DevOps",
  "AI-assisted software development",
];

/**
 * @param {SeoSite} site
 * @param {{ sameAs?: string[] }} [opts]
 */
export function personSchema(site, { sameAs = [] } = {}) {
  return {
    "@type": "Person",
    "@id": absoluteUrl(site, "about/#person"),
    name: "White",
    alternateName: "ggwhite",
    url: absoluteUrl(site, "about/"),
    jobTitle: "Senior Backend Engineer",
    knowsAbout: KNOWS_ABOUT,
    sameAs,
  };
}

/** Lightweight author/publisher reference to the Person node. */
function personRef(site) {
  return {
    "@type": "Person",
    "@id": absoluteUrl(site, "about/#person"),
    name: "White",
    url: absoluteUrl(site, "about/"),
  };
}

/**
 * @param {SeoSite} site
 * @param {{ search?: boolean, lang?: string }} [opts]
 */
export function websiteSchema(site, { search = false, lang = "zh-Hant" } = {}) {
  const home = absoluteUrl(site, "");
  return {
    "@type": "WebSite",
    "@id": `${home}#website`,
    name: site.title,
    description: site.description,
    url: home,
    inLanguage: lang,
    author: personRef(site),
    ...(search && {
      potentialAction: {
        "@type": "SearchAction",
        target: {
          "@type": "EntryPoint",
          urlTemplate: `${absoluteUrl(site, "search/")}?q={search_term_string}`,
        },
        "query-input": "required name=search_term_string",
      },
    }),
  };
}

/** @param {{ name: string, path: string }[]} items */
export function breadcrumbSchema(site, items) {
  return {
    "@type": "BreadcrumbList",
    itemListElement: items.map((it, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: it.name,
      item: absoluteUrl(site, it.path),
    })),
  };
}

/**
 * @param {SeoSite} site
 * @param {{ title: string, description: string, url: string, image?: string,
 *   datePublished: Date, dateModified?: Date, tags?: string[], lang: string }} post
 */
export function blogPostingSchema(
  site,
  { title, description, url, image, datePublished, dateModified, tags = [], lang }
) {
  return {
    "@type": "BlogPosting",
    headline: title,
    description,
    url,
    mainEntityOfPage: { "@type": "WebPage", "@id": url },
    ...(image && { image }),
    datePublished: datePublished.toISOString(),
    dateModified: (dateModified ?? datePublished).toISOString(),
    author: personRef(site),
    publisher: personRef(site),
    inLanguage: lang,
    keywords: tags.join(", "),
    isPartOf: { "@id": `${absoluteUrl(site, "")}#website` },
  };
}

/**
 * @param {{ name: string, pitch: string, language: string, homepage?: { url: string } }[]} projects
 */
export function projectsItemListSchema(site, projects, user = "ggwhite") {
  return {
    "@type": "ItemList",
    name: `${site.title} — Projects`,
    itemListElement: projects.map((p, i) => {
      const repo = `https://github.com/${user}/${p.name}`;
      return {
        "@type": "ListItem",
        position: i + 1,
        item: {
          "@type": "SoftwareSourceCode",
          name: p.name,
          description: p.pitch.replace(/`/g, ""),
          codeRepository: repo,
          programmingLanguage: p.language,
          url: p.homepage?.url ?? repo,
          author: personRef(site),
        },
      };
    }),
  };
}

/**
 * Serialise schema nodes into one JSON-LD document. `<` is escaped so a value
 * containing `</script>` cannot end the script block early.
 */
export function toJsonLd(nodes) {
  return JSON.stringify({ "@context": "https://schema.org", "@graph": nodes }).replace(
    /</g,
    "\\u003c"
  );
}
