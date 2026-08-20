"use client";

import { useState } from "react";
import {
  buildCheckPrompt,
  runCheckBlock,
  type CheckBlock as CheckBlockData,
} from "@/lib/interactive-blocks";
import type { MentorActionContext } from "@/lib/mentor-actions";
import type { Lang } from "@/lib/i18n";
import { siteCopy } from "@/lib/site-copy";
import { InteractiveCardShell } from "./interactive-card-shell";
import { Reveal } from "@/components/motion/reveal";
import { RollLabel } from "@/components/motion/roll-label";

export function CheckBlock({
  block,
  mentorActionContext,
  lang,
}: {
  block: CheckBlockData;
  mentorActionContext?: MentorActionContext;
  lang: Lang;
}) {
  const common = siteCopy[lang].blocks.common;
  const copyT = siteCopy[lang].reader.copy;
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [submitted, setSubmitted] = useState(false);
  const [copyState, setCopyState] = useState<"idle" | "done" | "fail">("idle");

  const toggle = (id: string) => {
    setSubmitted(false);
    setCopyState("idle");
    setSelected((prev) => {
      if (block.mode === "single") return new Set([id]);
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const reset = () => {
    setSelected(new Set());
    setSubmitted(false);
    setCopyState("idle");
  };

  const checkFeedback = () => {
    setSubmitted(true);
  };

  const copy = async () => {
    const result = runCheckBlock(block, selected);
    try {
      await navigator.clipboard.writeText(buildCheckPrompt(block, result, lang, mentorActionContext));
      setCopyState("done");
    } catch {
      setCopyState("fail");
    }
  };

  return (
    <InteractiveCardShell eyebrow={block.label} title={block.prompt}>
      <div className="interactive-options">
        {block.choices.map((choice) => {
          const active = selected.has(choice.id);
          const revealed = submitted && active;
          return (
            <button
              key={choice.id}
              type="button"
              className={active ? "interactive-option is-active" : "interactive-option"}
              aria-pressed={active}
              onClick={() => toggle(choice.id)}
            >
              <span>{choice.text}</span>
              <Reveal show={revealed} className="opt-reveal">
                <small className={choice.correct ? "is-correct" : "is-wrong"}>{choice.feedback}</small>
              </Reveal>
            </button>
          );
        })}
      </div>
      <div className="interactive-actions">
        <button type="button" onClick={checkFeedback} disabled={selected.size === 0}>{common.showFeedback}</button>
        <button type="button" onClick={reset}>{common.reset}</button>
        <button type="button" onClick={copy} disabled={selected.size === 0}>
          <RollLabel state={copyState} idle={common.copyToAgent} done={copyT.copied} fail={copyT.failed} />
        </button>
      </div>
    </InteractiveCardShell>
  );
}
