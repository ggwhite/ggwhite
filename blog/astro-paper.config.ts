import { defineAstroPaperConfig } from "./src/types/config";

export default defineAstroPaperConfig({
  site: {
    // Project page: served under /ggwhite (see `base` in astro.config.ts).
    url: "https://ggwhite.github.io",
    title: "White's Tech Notes",
    description:
      "Backend engineering notes on Go, Java, Lua, DevOps and AI-assisted development. 後端工程師的技術筆記：踩過的坑、根因與解法。",
    author: "White (ggwhite)",
    profile: "https://github.com/ggwhite",
    ogImage: "og-image.png",
    lang: "en",
    timezone: "Asia/Taipei",
    dir: "ltr",
  },
  posts: {
    perPage: 10,
    perIndex: 6,
  },
  features: {
    lightAndDarkMode: true,
    // Satori ships no CJK font, so per-post OG images would render tofu.
    dynamicOgImage: false,
    showArchives: true,
    showBackButton: true,
    editPost: {
      enabled: true,
      url: "https://github.com/ggwhite/ggwhite/edit/main/",
    },
    search: "pagefind",
    toc: true,
  },
  socials: [
    { name: "github", url: "https://github.com/ggwhite", linkTitle: "White on GitHub" },
    { name: "linkedin", url: "https://www.linkedin.com/in/white-chang/", linkTitle: "White on LinkedIn" },
    { name: "resume", url: "https://ggwhite.github.io/resume/", linkTitle: "White's resume" },
  ],
  shareLinks: [
    { name: "x", url: "https://x.com/intent/post?url=" },
    { name: "linkedin", url: "https://www.linkedin.com/sharing/share-offsite/?url=" },
    { name: "telegram", url: "https://t.me/share/url?url=" },
    { name: "mail", url: "mailto:?subject=See%20this%20post&body=" },
  ],
});
