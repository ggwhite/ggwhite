/**
 * Rehype plugin: add rel="noopener" to links that leave the site. Own repos
 * are not marked nofollow; nothing else about the link changes.
 * @param {{ siteHost: string }} options
 */
export function rehypeExternalLinks({ siteHost }) {
  const visit = node => {
    if (node.type === "element" && node.tagName === "a") {
      const href = String(node.properties?.href ?? "");
      if (/^https?:\/\//i.test(href)) {
        let host = "";
        try {
          host = new URL(href).host;
        } catch {
          /* malformed URL: treat as external */
        }
        if (host !== siteHost) {
          const rel = [].concat(node.properties.rel ?? []);
          if (!rel.includes("noopener")) rel.push("noopener");
          node.properties.rel = rel;
        }
      }
    }
    node.children?.forEach(visit);
  };
  return tree => visit(tree);
}
