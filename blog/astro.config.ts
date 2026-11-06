import { fileURLToPath } from "node:url";
import {
  defineConfig,
  envField,
  fontProviders,
  svgoOptimizer,
} from "astro/config";
import tailwindcss from "@tailwindcss/vite";
import mdx from "@astrojs/mdx";
import sitemap from "@astrojs/sitemap";
import { rehypeHeadingIds, unified } from "@astrojs/markdown-remark";
import rehypeCallouts from "rehype-callouts";
import {
  transformerNotationDiff,
  transformerNotationHighlight,
  transformerNotationWordHighlight,
} from "@shikijs/transformers";
import { transformerFileName } from "./src/utils/transformers/fileName";
import { rehypeTableWrapper } from "./src/utils/rehypeTableWrapper";
import {
  inlineTocDeprecation,
  rehypeInlineToc,
} from "./src/utils/rehypeInlineToc";
import { rehypeExternalLinks } from "./src/utils/rehypeExternalLinks";
import { tilEntries, tilLastModMap } from "./src/loaders/tilGit";
import config from "./astro-paper.config";

const tilDir = fileURLToPath(new URL("../til", import.meta.url));
// Post slug → last git commit of its note, for sitemap <lastmod>.
const postLastMod = tilLastModMap(tilDir);
// Old post slugs replaced by a `<!-- slug: -->` override; their pages are
// redirect stubs (src/pages/posts/[legacySlug].astro).
const legacyPostSlugs = new Set(
  tilEntries(tilDir).flatMap(e => (e.legacySlug ? [e.legacySlug] : []))
);
const postSlugOf = (page: string) => {
  const slug = page.match(/\/posts\/([^/]+)\/?$/)?.[1];
  return slug && decodeURIComponent(slug);
};

export default defineConfig({
  site: config.site.url,
  // GitHub Pages project page: https://ggwhite.github.io/ggwhite/
  base: "/ggwhite",
  integrations: [
    mdx(),
    sitemap({
      // /tags/ pages are redirect stubs to /categories/ (see src/pages/tags),
      // and so are old post URLs (see src/pages/posts/[legacySlug].astro).
      filter: page =>
        !/\/search\/?$/.test(page) &&
        !/\/tags(\/|$)/.test(page) &&
        !legacyPostSlugs.has(postSlugOf(page) || "") &&
        (config.features?.showArchives !== false ||
          !/\/archives\/?$/.test(page)),
      serialize: item => {
        const slug = postSlugOf(item.url);
        const lastmod = slug && postLastMod.get(slug);
        return lastmod ? { ...item, lastmod } : item;
      },
    }),
    inlineTocDeprecation(),
  ],
  i18n: {
    locales: ["en"],
    defaultLocale: "en",
    routing: {
      prefixDefaultLocale: false,
    },
  },
  markdown: {
    // Deprecated: the theme no longer uses remark-toc or remark-collapse. They
    // stay in package.json so a customised config importing them still builds,
    // and are removed in v8.
    processor: unified({
      rehypePlugins: [
        rehypeHeadingIds,
        rehypeInlineToc,
        rehypeCallouts,
        rehypeTableWrapper,
        [rehypeExternalLinks, { siteHost: new URL(config.site.url).host }],
      ],
    }),
    shikiConfig: {
      themes: { light: "github-light", dark: "github-dark-dimmed" },
      defaultColor: false,
      wrap: false,
      transformers: [
        transformerFileName({ style: "v2", hideDot: false }),
        transformerNotationHighlight(),
        transformerNotationWordHighlight(),
        transformerNotationDiff({ matchAlgorithm: "v3" }),
      ],
    },
  },
  vite: {
    plugins: [tailwindcss()],
  },
  fonts: [
    {
      name: "Google Sans Code",
      cssVariable: "--font-google-sans-code",
      provider: fontProviders.google(),
      fallbacks: ["monospace"],
      weights: [300, 400, 500, 600, 700],
      styles: ["normal", "italic"],
      formats: ["woff", "ttf"],
    },
  ],
  env: {
    schema: {
      PUBLIC_GOOGLE_SITE_VERIFICATION: envField.string({
        access: "public",
        context: "client",
        optional: true,
      }),
    },
  },
  experimental: {
    svgOptimizer: svgoOptimizer(),
  },
});
