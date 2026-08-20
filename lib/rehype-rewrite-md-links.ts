import { visit } from "unist-util-visit";
import type { Root, Element } from "hast";

/**
 * Rehype plugin: rewrite relative .md links to proper Next.js routes.
 * - `./NN-slug.md` → `/[current-course]/NN-slug` (strip .md, resolve to course)
 * - `./README.md` → `/[current-course]` (course landing page)
 * - `./sources.md` → `/[current-course]/sources` (dedicated sources page)
 *
 * Pass the current course slug via options: `rehypeRewriteMdLinks({ courseSlug })`
 */
export function rehypeRewriteMdLinks(options?: { courseSlug?: string }) {
  const courseSlug = options?.courseSlug || "";
  return (tree: Root) => {
    visit(tree, "element", (node: Element) => {
      if (node.tagName === "a" && node.properties && typeof node.properties.href === "string") {
        const href = node.properties.href;
        // Rewrite relative .md links: ./README.md → /course, ./sources.md → /course/sources, ./NN-slug.md → /course/NN-slug
        if (href.startsWith("./") && href.endsWith(".md")) {
          const slug = href.slice(2).replace(/\.md$/, ""); // strip ./ and .md → "sources" or "NN-slug"
          if (slug === "README") {
            node.properties.href = courseSlug ? `/${courseSlug}` : "/";
          } else {
            node.properties.href = courseSlug ? `/${courseSlug}/${slug}` : `/${slug}`;
          }
        }
      }
    });
  };
}
