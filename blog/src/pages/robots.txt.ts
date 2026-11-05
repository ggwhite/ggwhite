import type { APIRoute } from "astro";
import { getAssetPath } from "@/utils/withBase";

const getRobotsTxt = (sitemapURL: URL) => `
User-agent: *
Allow: /

Sitemap: ${sitemapURL.href}
`;

export const GET: APIRoute = ({ site }) => {
  // Served at /ggwhite/robots.txt, which crawlers never read on a project
  // site; kept for completeness with the base-aware sitemap URL.
  const sitemapURL = new URL(getAssetPath("sitemap-index.xml"), site);
  return new Response(getRobotsTxt(sitemapURL));
};
