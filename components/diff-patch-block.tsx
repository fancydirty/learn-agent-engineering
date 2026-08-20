"use client";

import { useMemo, useState } from "react";
import {
  buildDiffPrompt,
  parseDiffLines,
  runDiffChoiceCheck,
  type DiffBlock as DiffBlockData,
} from "@/lib/learning-interactions";
import type { MentorActionContext } from "@/lib/mentor-actions";
import type { Lang } from "@/lib/i18n";
import { siteCopy } from "@/lib/site-copy";
import { InteractiveCardShell } from "./interactive-card-shell";
import { Reveal } from "@/components/motion/reveal";
import { RollLabel } from "@/components/motion/roll-label";

export function DiffPatchBlock({
  block,
  mentorActionContext,
  lang,
}: {
  block: DiffBlockData;
  mentorActionContext?: MentorActionContext;
  lang: Lang;
}) {
  const common = siteCopy[lang].blocks.common;
  const diffT = siteCopy[lang].blocks.diff;
  const copyT = siteCopy[lang].reader.copy;
  const [selectedChoiceId, setSelectedChoiceId] = useState("");
  const [hasChecked, setHasChecked] = useState(false);
  const [copyState, setCopyState] = useState<"idle" | "done" | "fail">("idle");
  const diffLines = useMemo(() => parseDiffLines(block.diff), [block.diff]);
  const result = useMemo(() => runDiffChoiceCheck(block, selectedChoiceId), [block, selectedChoiceId]);

  const checkChoice = () => {
    setHasChecked(true);
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(buildDiffPrompt(block, selectedChoiceId, result, lang, mentorActionContext));
      setCopyState("done");
    } catch {
      setCopyState("fail");
    }
    window.setTimeout(() => setCopyState("idle"), 1600);
  };

  return (
    <InteractiveCardShell eyebrow={block.label} title={block.prompt}>
      <p className="learning-interaction-why">{block.whyHere}</p>
      <p className="diff-patch-focus">{block.focus}</p>
      <pre className="diff-patch-view" data-language={block.language || "diff"}>
        <code>
          {diffLines.map((line, index) => (
            <span key={`${index}-${line.text}`} className={`diff-line is-${line.kind}`}>
              {line.text || " "}
            </span>
          ))}
        </code>
      </pre>

      <div className="diff-choice-list" role="list" aria-label={diffT.choicesAria}>
        {block.choices.map((choice) => (
          <button
            key={choice.id}
            type="button"
            className={`diff-choice${choice.id === selectedChoiceId ? " is-active" : ""}`}
            aria-pressed={choice.id === selectedChoiceId}
            onClick={() => {
              setSelectedChoiceId(choice.id);
              setHasChecked(false);
            }}
          >
            {choice.text}
          </button>
        ))}
      </div>

      <Reveal show={hasChecked}>
        <div
          className={result.passed ? "learning-summary is-correct" : "learning-summary is-wrong"}
          aria-live="polite"
        >
          {result.passed ? common.localCheckPassed : common.localCheckFailed} {result.message}
        </div>
      </Reveal>

      <div className="interactive-actions">
        <button type="button" onClick={checkChoice} disabled={!selectedChoiceId}>{common.check}</button>
        <button type="button" onClick={() => { setSelectedChoiceId(""); setHasChecked(false); }}>{common.reset}</button>
        <button type="button" onClick={copy}>
          <RollLabel state={copyState} idle={common.copyToAgent} done={copyT.copied} fail={copyT.failed} />
        </button>
      </div>
    </InteractiveCardShell>
  );
}
