// course-reader/lib/codemirror-changed-lines.ts
import { RangeSetBuilder, type Extension } from "@codemirror/state";
import { Decoration, EditorView } from "@codemirror/view";

// Decorate given lines (1-based) with .cm-changed-line for "view reference answer" diff marking.
export function changedLinesExtension(lines: number[]): Extension {
  if (!lines.length) return [];
  return EditorView.decorations.compute(["doc"], (state) => {
    const builder = new RangeSetBuilder<Decoration>();
    for (const ln of lines) {
      if (ln >= 1 && ln <= state.doc.lines) {
        const line = state.doc.line(ln);
        builder.add(line.from, line.from, Decoration.line({ class: "cm-changed-line" }));
      }
    }
    return builder.finish();
  });
}
