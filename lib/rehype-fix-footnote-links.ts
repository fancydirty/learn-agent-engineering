import { visit } from "unist-util-visit";
import type { Root, Element } from "hast";

/**
 * Rehype plugin: fix footnote reference/backref links to be in-page anchor jumps.
 * Rehype plugin: fix footnote reference/backref links to be in-page anchor jumps.
 * Streamdown defaults footnote <a> to target="_blank" rel="noreferrer" (external-link behavior),
 * but footnotes are in-page anchors (#user-content-fn-Sn) — new tab + anchor makes the browser
 * jump to a new page's anchor and bounce back. Strip target/rel on footnote refs and backrefs.
 */
export function rehypeFixFootnoteLinks() {
  return (tree: Root) => {
    visit(tree, "element", (node: Element) => {
      if (node.tagName !== "a" || !node.properties) return;
      const href = node.properties.href;
      const id = node.properties.id;
      // Footnote ref: href=#user-content-fn-Sn, id=user-content-fnref-Sn
      // Footnote backref (Footnotes ↩): href=#user-content-fnref-Sn, id=user-content-fn-Sn
      const isFnRef = typeof href === "string" && href.startsWith("#user-content-fn-");
      const isFnBackref = typeof href === "string" && href.startsWith("#user-content-fnref-");
      const hasFnId = typeof id === "string" && (id.startsWith("user-content-fnref-") || id.startsWith("user-content-fn-"));
      if (isFnRef || isFnBackref || hasFnId || node.properties["data-footnote-ref"]) {
        delete node.properties.target;
        delete node.properties.rel;
      }
    });
  };
}
