import type { APIRoute } from "astro";
import { getCollection, type CollectionEntry } from "astro:content";
import satori from "satori";
import sharp from "sharp";
import { getPostSlug } from "@/utils/getPostPaths";
import { getCategory } from "@/data/categories";
import { postFilter } from "@/utils/postFilter";
import { getOgFonts, OG_FONT_FAMILY } from "@/utils/ogFonts";
import config from "@/config";

export async function getStaticPaths() {
  if (!config.features.dynamicOgImage) {
    return [];
  }

  const posts = await getCollection("posts").then(p =>
    p.filter(post => postFilter(post) && !post.data.ogImage)
  );

  return posts.map(post => ({
    params: { slug: getPostSlug(post.id, post.filePath) },
    props: post,
  }));
}

const host = `${new URL(config.site.url).host}${import.meta.env.BASE_URL.replace(/\/$/, "")}`;

export const GET: APIRoute = async ({ props }) => {
  if (!config.features.dynamicOgImage) {
    return new Response(null, { status: 404, statusText: "Not found" });
  }

  const { data } = props as CollectionEntry<"posts">;
  const title = data.title;
  // Long titles shrink so they stay within three lines.
  const titleSize =
    [...title].length > 40 ? 52 : [...title].length > 24 ? 60 : 68;

  const svg = await satori(
    {
      key: null,
      type: "div",
      props: {
        style: {
          background: "#fcfbf8",
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          boxSizing: "border-box",
          padding: "56px 72px",
          fontFamily: OG_FONT_FAMILY,
          color: "#2a2b2e",
          borderTop: "16px solid #1b6ca8",
        },
        children: [
          {
            type: "div",
            props: {
              style: { display: "flex", gap: "16px", fontSize: 28 },
              children: [getCategory(data.category).label].map(label => ({
                type: "span",
                props: {
                  style: {
                    color: "#1b6ca8",
                    border: "3px solid #1b6ca8",
                    borderRadius: "8px",
                    padding: "4px 16px",
                  },
                  children: label,
                },
              })),
            },
          },
          {
            type: "div",
            props: {
              style: {
                display: "flex",
                fontSize: titleSize,
                lineHeight: 1.35,
                maxHeight: "290px",
                overflow: "hidden",
              },
              children: title,
            },
          },
          {
            type: "div",
            props: {
              style: {
                display: "flex",
                justifyContent: "space-between",
                alignItems: "flex-end",
                fontSize: 28,
                color: "#6b6f76",
                borderTop: "3px solid #e4e1da",
                paddingTop: "24px",
              },
              children: [
                {
                  type: "span",
                  props: {
                    style: { color: "#2a2b2e" },
                    children: config.site.title,
                  },
                },
                { type: "span", props: { children: host } },
              ],
            },
          },
        ],
      },
    },
    {
      width: 1200,
      height: 630,
      embedFont: true,
      fonts: await getOgFonts(),
    }
  );

  const pngBuffer = await sharp(Buffer.from(svg)).png().toBuffer();

  return new Response(new Uint8Array(pngBuffer), {
    headers: { "Content-Type": "image/png" },
  });
};
