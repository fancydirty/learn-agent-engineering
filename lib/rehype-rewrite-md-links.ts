import { visit } from "unist-util-visit";
import type { Root, Element } from "hast";

/**
 * Rehype plugin: rewrite relative .md links to proper Next.js routes.
 * - `./NN-slug.md` → `/[locale]/[current-course]/NN-slug` (strip .md, resolve to course)
 * - `./README.md` → `/[locale]/[current-course]` (course landing page)
 * - `./sources.md` → `/[locale]/[current-course]/sources` (dedicated sources page)
 *
 * Pass the current course slug and locale via options:
 * `rehypeRewriteMdLinks({ courseSlug, locale })`
 */
export function rehypeRewriteMdLinks(options?: { courseSlug?: string; locale?: string }) {
  const courseSlug = options?.courseSlug || "";
  const prefix = options?.locale ? `/${options.locale}` : "";
  return (tree: Root) => {
    visit(tree, "element", (node: Element) => {
      if (node.tagName === "a" && node.properties && typeof node.properties.href === "string") {
        const href = node.properties.href;
        // Rewrite relative .md links: ./README.md → /locale/course, ./sources.md → /locale/course/sources, ./NN-slug.md → /locale/course/NN-slug
        if (href.startsWith("./") && href.endsWith(".md")) {
          const slug = href.slice(2).replace(/\.md$/, ""); // strip ./ and .md → "sources" or "NN-slug"
          if (slug === "README") {
            node.properties.href = courseSlug ? `${prefix}/${courseSlug}` : "/";
          } else {
            node.properties.href = courseSlug ? `${prefix}/${courseSlug}/${slug}` : `${prefix}/${slug}`;
          }
        }
      }
    });
  };
}
