"use client";
import { useState } from "react";
import { buildMentorActionPrompt, type MentorAction } from "@/lib/mentor-actions";
import type { Lang } from "@/lib/i18n";
import { siteCopy } from "@/lib/site-copy";
import { CopyGlyph } from "@/components/motion/copy-glyph";
import { RollLabel } from "@/components/motion/roll-label";

export function MentorActionCard({ action, lang }: { action: MentorAction; lang: Lang }) {
  const t = siteCopy[lang].blocks.mentorAction;
  const common = siteCopy[lang].blocks.common;
  const copyT = siteCopy[lang].reader.copy;
  const [state, setState] = useState<"idle" | "done" | "fail">("idle");
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(buildMentorActionPrompt(action, lang));
      setState("done");
    } catch {
      setState("fail");
    }
    window.setTimeout(() => setState("idle"), 1600);
  };

  return (
    <aside className="mentor-action-card" aria-label={t.landmark(action.label)}>
      <div className="mentor-action-copy">
        <div>
          <div className="mentor-action-kicker">{t.kicker}</div>
          <h3>{action.label}</h3>
          {action.description ? <p>{action.description}</p> : null}
        </div>
        <button type="button" onClick={copy} aria-label={t.copyAria(action.label)}>
          <CopyGlyph done={state === "done"} size={14} />
          <RollLabel state={state} idle={common.copyToAgent} done={copyT.copied} fail={copyT.failed} />
        </button>
      </div>
    </aside>
  );
}
