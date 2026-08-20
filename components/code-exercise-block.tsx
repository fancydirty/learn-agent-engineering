"use client";

import dynamic from "next/dynamic";
import { useMemo, useState } from "react";
import { css } from "@codemirror/lang-css";
import { html } from "@codemirror/lang-html";
import { javascript } from "@codemirror/lang-javascript";
import { python } from "@codemirror/lang-python";
import {
  Decoration,
  MatchDecorator,
  ViewPlugin,
  type DecorationSet,
  type EditorView,
  type ViewUpdate,
} from "@codemirror/view";
import type { ReactCodeMirrorProps } from "@uiw/react-codemirror";
import {
  buildCodeFromSlots,
  buildCodeExercisePrompt,
  runCodeExerciseChecks,
  splitCodeExerciseSlots,
  type CodeExerciseBlock as CodeExerciseBlockData,
  type CodeExerciseLanguage,
  type CodeExerciseSlotPart,
} from "@/lib/code-exercises";
import type { MentorActionContext } from "@/lib/mentor-actions";
import type { Lang } from "@/lib/i18n";
import { siteCopy } from "@/lib/site-copy";
import { InteractiveCardShell } from "./interactive-card-shell";
import { Reveal } from "@/components/motion/reveal";
import { RollLabel } from "@/components/motion/roll-label";
import { useIsDark } from "@/lib/use-is-dark";
import { darkEditorExtensions } from "@/lib/codemirror-theme";
import type { SlotRenderPart } from "@/lib/slot-highlight";
import { useSlotHighlight, plainSlotParts } from "@/lib/use-shiki";

function CodeMirrorLoading() {
  return <div className="code-exercise-loading" aria-hidden="true" />;
}

const CodeMirror = dynamic<ReactCodeMirrorProps>(
  () => import("@uiw/react-codemirror").then((mod) => mod.default),
  {
    ssr: false,
    loading: CodeMirrorLoading,
  },
);

function extensionsFor(language: CodeExerciseLanguage | "") {
  if (language === "css") return [css()];
  if (language === "html") return [html()];
  if (language === "python") return [python()];
  if (language === "javascript" || language === "jsx") {
    return [javascript({ jsx: language === "jsx" })];
  }
  if (language === "typescript" || language === "tsx") {
    return [javascript({ typescript: true, jsx: language === "tsx" })];
  }
  return [];
}

const placeholderMatcher = new MatchDecorator({
  regexp: /_{3,}/g,
  decoration: Decoration.mark({ class: "cm-placeholder-blank" }),
});

const placeholderBlankExtension = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;

    constructor(view: EditorView) {
      this.decorations = placeholderMatcher.createDeco(view);
    }

    update(update: ViewUpdate) {
      this.decorations = placeholderMatcher.updateDeco(update, this.decorations);
    }
  },
  {
    decorations: (plugin) => plugin.decorations,
  },
);

function slotCount(parts: CodeExerciseSlotPart[]) {
  return parts.filter((part) => part.type === "slot").length;
}

function CodeSlotEditor({
  language,
  parts,
  values,
  isFocused,
  setIsFocused,
  onChange,
  lang,
}: {
  language: CodeExerciseLanguage | "";
  parts: CodeExerciseSlotPart[];
  values: string[];
  isFocused: boolean;
  setIsFocused: (value: boolean) => void;
  onChange: (index: number, value: string) => void;
  lang: Lang;
}) {
  const codeT = siteCopy[lang].blocks.code;
  const slotHl = useSlotHighlight();
  const rendered = useMemo<SlotRenderPart[]>(
    () => (slotHl ? slotHl.highlightSlotParts(parts, language) : plainSlotParts(parts)),
    [slotHl, parts, language],
  );
  return (
    <div
      className={isFocused ? "code-exercise-editor code-slot-editor is-focused" : "code-exercise-editor code-slot-editor"}
      data-language={language || "text"}
    >
      <pre className="code-slot-code">
        <code>
          {rendered.map((part, partIndex) => {
            if (part.type === "code") {
              return part.runs.map((run, runIndex) => (
                <span
                  key={`code-${partIndex}-${runIndex}`}
                  style={run.htmlStyle as React.CSSProperties | undefined}
                >
                  {run.text}
                </span>
              ));
            }
            const value = values[part.index] ?? "";
            const width = Math.max(part.placeholder.length, value.length, 4) + 1;
            return (
              <input
                key={`slot-${part.index}`}
                className="code-slot-input"
                value={value}
                onChange={(event) => onChange(part.index, event.target.value.replace(/\n/g, ""))}
                onFocus={() => setIsFocused(true)}
                onBlur={() => setIsFocused(false)}
                aria-label={codeT.slotAria(part.index + 1)}
                autoComplete="off"
                spellCheck={false}
                style={{ width: `${width}ch` }}
              />
            );
          })}
        </code>
      </pre>
    </div>
  );
}

export function CodeExerciseBlock({
  block,
  mentorActionContext,
  lang,
}: {
  block: CodeExerciseBlockData;
  mentorActionContext?: MentorActionContext;
  lang: Lang;
}) {
  const slotParts = useMemo(
    () => block.type === "code" ? splitCodeExerciseSlots(block.starter) : [],
    [block.starter, block.type],
  );
  const hasSlotEditor = block.type === "code" && slotCount(slotParts) > 0;
  const common = siteCopy[lang].blocks.common;
  const codeT = siteCopy[lang].blocks.code;
  const copyT = siteCopy[lang].reader.copy;
  const [slotValues, setSlotValues] = useState<string[]>(() => Array(slotCount(slotParts)).fill(""));
  const [editorCode, setEditorCode] = useState(block.starter);
  const [hasChecked, setHasChecked] = useState(false);
  const [isFocused, setIsFocused] = useState(false);
  const [copyState, setCopyState] = useState<"idle" | "done" | "fail">("idle");
  const isDark = useIsDark();
  const extensions = useMemo(
    () => [
      ...extensionsFor(block.language),
      placeholderBlankExtension,
      ...(isDark ? darkEditorExtensions : []),
    ],
    [block.language, isDark],
  );
  const code = useMemo(
    () => hasSlotEditor ? buildCodeFromSlots(block.starter, slotValues) : editorCode,
    [block.starter, editorCode, hasSlotEditor, slotValues],
  );
  const results = useMemo(() => runCodeExerciseChecks(block, code), [block, code]);
  const passed = results.filter((result) => result.passed).length;
  const allPassed = results.length > 0 && passed === results.length;

  const checkCode = () => {
    setHasChecked(true);
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(buildCodeExercisePrompt(block, code, results, lang, mentorActionContext));
      setCopyState("done");
    } catch {
      setCopyState("fail");
    }
    window.setTimeout(() => setCopyState("idle"), 1600);
  };

  return (
    <InteractiveCardShell eyebrow={block.label} title={block.prompt}>
      <p className="code-exercise-why">{block.whyHere}</p>
      {block.type === "fix" && block.bug ? (
        <p className="code-exercise-bug"><strong>{codeT.bugLabel}</strong> {block.bug}</p>
      ) : null}
      {hasSlotEditor ? (
        <CodeSlotEditor
          language={block.language}
          parts={slotParts}
          values={slotValues}
          isFocused={isFocused}
          setIsFocused={setIsFocused}
          onChange={(index, value) => {
            setSlotValues((prev) => {
              const next = [...prev];
              next[index] = value;
              return next;
            });
            setHasChecked(false);
          }}
          lang={lang}
        />
      ) : (
        <div
          className={isFocused ? "code-exercise-editor is-focused" : "code-exercise-editor"}
          data-language={block.language || "text"}
        >
          <CodeMirror
            value={editorCode}
            height="220px"
            theme={isDark ? "none" : "light"}
            extensions={extensions}
            basicSetup={{
              lineNumbers: true,
              foldGutter: false,
              highlightActiveLine: true,
            }}
            onChange={(value) => {
              setEditorCode(value);
              setHasChecked(false);
            }}
            onFocus={() => setIsFocused(true)}
            onBlur={() => setIsFocused(false)}
            aria-label={codeT.editorAria}
          />
        </div>
      )}

      <Reveal show={hasChecked}>
        <div
          className={allPassed ? "code-exercise-summary is-correct" : "code-exercise-summary is-wrong"}
          aria-live="polite"
        >
          {allPassed ? codeT.allPassed : codeT.partialPassed(passed, results.length)}
        </div>
        <ul className="code-exercise-results">
          {results.map((result) => (
            <li key={result.id} className={result.passed ? "is-correct" : "is-wrong"}>
              <span aria-hidden="true">{result.passed ? "✓" : "×"}</span>
              <span>{result.message}</span>
            </li>
          ))}
        </ul>
      </Reveal>

      <div className="interactive-actions">
        <button type="button" onClick={checkCode}>{common.check}</button>
        <button
          type="button"
          onClick={() => {
            if (hasSlotEditor) setSlotValues(Array(slotCount(slotParts)).fill(""));
            else setEditorCode(block.starter);
            setHasChecked(false);
          }}
        >
          {common.reset}
        </button>
        <button type="button" onClick={copy}>
          <RollLabel state={copyState} idle={common.copyToAgent} done={copyT.copied} fail={copyT.failed} />
        </button>
      </div>
    </InteractiveCardShell>
  );
}
