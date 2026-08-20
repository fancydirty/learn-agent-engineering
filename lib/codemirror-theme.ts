import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { EditorView } from "@codemirror/view";
import { tags as t } from "@lezer/highlight";

// tokyo-night syntax colors aligned with markdown code blocks (.code-block Shiki tokyo-night).
// Dark mode only; background comes from .code-exercise-editor near-black well — tokens only here.
export const tokyoNightHighlightStyle = HighlightStyle.define([
  { tag: [t.keyword, t.controlKeyword, t.moduleKeyword, t.operatorKeyword, t.definitionKeyword], color: "#bb9af7" },
  { tag: [t.function(t.variableName), t.function(t.propertyName)], color: "#7aa2f7" },
  { tag: [t.string, t.special(t.string)], color: "#9ece6a" },
  { tag: [t.number, t.bool, t.null], color: "#ff9e64" },
  { tag: [t.constant(t.variableName), t.standard(t.name)], color: "#ff9e64" },
  { tag: [t.variableName, t.definition(t.variableName)], color: "#c0caf5" },
  { tag: t.propertyName, color: "#7dcfff" },
  { tag: [t.typeName, t.className, t.namespace], color: "#2ac3de" },
  { tag: [t.comment, t.lineComment, t.blockComment], color: "#565f89", fontStyle: "italic" },
  { tag: t.tagName, color: "#f7768e" },
  { tag: t.attributeName, color: "#e0af68" },
  { tag: [t.operator, t.punctuation, t.bracket], color: "#89ddff" },
  { tag: t.invalid, color: "#f7768e" },
]);

// Dark chrome: transparent background (lets .code-exercise-editor #0e0f13 show through),
// selection/cursor/gutter use site CSS vars for dark consistency.
export const darkChromeTheme = EditorView.theme(
  {
    "&": { backgroundColor: "transparent", color: "var(--foreground)" },
    ".cm-content": { caretColor: "var(--foreground)" },
    ".cm-cursor, .cm-dropCursor": { borderLeftColor: "var(--foreground)" },
    "&.cm-focused .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection": {
      backgroundColor: "var(--accent-soft)",
    },
    ".cm-activeLine": { backgroundColor: "color-mix(in srgb, var(--foreground) 5%, transparent)" },
    ".cm-gutters": { backgroundColor: "transparent", color: "var(--ink-subtle)", border: "none" },
    ".cm-activeLineGutter": { backgroundColor: "transparent" },
  },
  { dark: true },
);

export const darkEditorExtensions = [darkChromeTheme, syntaxHighlighting(tokyoNightHighlightStyle)];
