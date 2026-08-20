"use client";

import { useMemo, useState } from "react";
import {
  buildPredictPrompt,
  runPredictCheck,
  type PredictBlock as PredictBlockData,
} from "@/lib/learning-interactions";
import type { MentorActionContext } from "@/lib/mentor-actions";
import type { Lang } from "@/lib/i18n";
import { siteCopy } from "@/lib/site-copy";
import { InteractiveCardShell } from "./interactive-card-shell";
import { Reveal } from "@/components/motion/reveal";
import { RollLabel } from "@/components/motion/roll-label";
import { CodeBlock } from "@/components/code-block";

export function PredictOutputBlock({
  block,
  mentorActionContext,
  lang,
}: {
  block: PredictBlockData;
  mentorActionContext?: MentorActionContext;
  lang: Lang;
}) {
  const common = siteCopy[lang].blocks.common;
  const copyT = siteCopy[lang].reader.copy;
  const predictT = siteCopy[lang].blocks.predict;
  const [answer, setAnswer] = useState("");
  const [hasChecked, setHasChecked] = useState(false);
  const [copyState, setCopyState] = useState<"idle" | "done" | "fail">("idle");
  const result = useMemo(() => runPredictCheck(block, answer), [block, answer]);

  const checkAnswer = () => {
    setHasChecked(true);
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(buildPredictPrompt(block, answer, result, lang, mentorActionContext));
      setCopyState("done");
    } catch {
      setCopyState("fail");
    }
    window.setTimeout(() => setCopyState("idle"), 1600);
  };

  return (
    <InteractiveCardShell eyebrow={block.label} title={block.prompt}>
      <p className="learning-interaction-why">{block.whyHere}</p>
      <CodeBlock code={block.snippet} language={block.language || "text"} lang={lang} />
      <label className="predict-answer-label" htmlFor={`${block.id}-answer`}>
        {predictT.myPrediction}
      </label>
      <textarea
        id={`${block.id}-answer`}
        className="predict-answer"
        value={answer}
        rows={3}
        autoCapitalize="off"
        autoCorrect="off"
        spellCheck={false}
        onChange={(event) => {
          setAnswer(event.target.value);
          setHasChecked(false);
        }}
      />

      <Reveal show={hasChecked}>
        <div
          className={result.passed ? "learning-summary is-correct" : "learning-summary is-wrong"}
          aria-live="polite"
        >
          {result.passed ? common.localCheckPassed : common.localCheckFailed} {result.message}
        </div>
      </Reveal>

      <div className="interactive-actions">
        <button type="button" onClick={checkAnswer}>{common.check}</button>
        <button type="button" onClick={() => { setAnswer(""); setHasChecked(false); }}>{common.reset}</button>
        <button type="button" onClick={copy}>
          <RollLabel state={copyState} idle={common.copyToAgent} done={copyT.copied} fail={copyT.failed} />
        </button>
      </div>
    </InteractiveCardShell>
  );
}
