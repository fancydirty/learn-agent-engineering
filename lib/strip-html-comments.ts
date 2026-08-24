/**
 * Strip agent-mentor-skill authoring audit trail comments from markdown
 * before it reaches Streamdown. Only matches `<!-- registry: ... -->`
 * (single- or multi-line). Leaves structural anchors alone
 * (`<!-- exercises -->`, `<!-- rubric -->`, etc. used by lib/exercises.ts).
 */
const REGISTRY_COMMENT = /<!--\s*registry:[\s\S]*?-->/g;

export function stripHtmlComments(md: string): string {
  return md.replace(REGISTRY_COMMENT, "");
}

/** Alias kept for call sites that want the intent spelled out. */
export const stripRegistryComments = stripHtmlComments;
