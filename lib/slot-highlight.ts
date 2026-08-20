import { tokenizeCode } from "./shiki-highlighter";
import { type CodeExerciseSlotPart } from "./code-exercises";

export type SlotRun = { text: string; htmlStyle?: Record<string, string> };
export type SlotRenderPart =
  | { type: "code"; runs: SlotRun[] }
  | { type: "slot"; index: number; placeholder: string };

// Tokenize the full starter with slots in one pass (parts rejoin starter; ___ placeholders parse as identifiers),
// then slice colored text runs + slots by char offset. Falls back to plain color on unsupported languages.
export function highlightSlotParts(
  parts: CodeExerciseSlotPart[],
  language: string,
): SlotRenderPart[] {
  const starter = parts
    .map((p) => (p.type === "text" ? p.text : p.placeholder))
    .join("");
  const { tokens } = tokenizeCode(starter, language);

  // char → htmlStyle (shared object ref within a token; newline between lines gets style=undefined)
  const styleByChar: (Record<string, string> | undefined)[] = new Array(starter.length);
  let offset = 0;
  tokens.forEach((line, li) => {
    for (const tok of line) {
      for (let i = 0; i < tok.content.length; i++) styleByChar[offset + i] = tok.htmlStyle;
      offset += tok.content.length;
    }
    if (li < tokens.length - 1) {
      styleByChar[offset] = undefined;
      offset += 1;
    }
  });

  const result: SlotRenderPart[] = [];
  let pos = 0;
  for (const part of parts) {
    if (part.type === "slot") {
      result.push({ type: "slot", index: part.index, placeholder: part.placeholder });
      pos += part.placeholder.length;
      continue;
    }
    const runs: SlotRun[] = [];
    let runText = "";
    let runStyle: Record<string, string> | undefined;
    let started = false;
    for (let i = 0; i < part.text.length; i++) {
      const style = styleByChar[pos + i];
      if (!started) {
        runStyle = style;
        runText = part.text[i];
        started = true;
      } else if (style === runStyle) {
        runText += part.text[i];
      } else {
        runs.push({ text: runText, htmlStyle: runStyle });
        runStyle = style;
        runText = part.text[i];
      }
    }
    if (started) runs.push({ text: runText, htmlStyle: runStyle });
    result.push({ type: "code", runs });
    pos += part.text.length;
  }
  return result;
}
