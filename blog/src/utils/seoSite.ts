import config from "@/config";

/** Site info for the pure helpers in ./seo.js. */
export const seoSite = {
  origin: config.site.url,
  base: import.meta.env.BASE_URL,
  title: config.site.title,
  description: config.site.description,
  author: config.site.author,
};

/** Profiles that identify the author (schema.org Person.sameAs). */
export const sameAs = config.socials.map(s => s.url);

/** "<page> | White's Tech Notes" */
export const pageTitle = (title: string) => `${title} | ${config.site.title}`;

/** " – Page N" suffix for paginated listings past the first page. */
export const pageSuffix = (n: number) => (n > 1 ? ` – Page ${n}` : "");
