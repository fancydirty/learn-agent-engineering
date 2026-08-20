"use client";
import { useState } from "react";
import type { Exercise } from "@/lib/exercises";
import type { Lang } from "@/lib/i18n";
import { buildExerciseMentorAction, buildMentorActionPrompt, type MentorActionContext } from "@/lib/mentor-actions";
import { siteCopy } from "@/lib/site-copy";
import { Md } from "./md";
import { Reveal } from "@/components/motion/reveal";
import { CopyGlyph } from "@/components/motion/copy-glyph";
import { RollLabel } from "@/components/motion/roll-label";

function exerciseHeadline(prompt: string): { title: string; body: string } {
  const lines = prompt.split("\n");
  const firstIdx = lines.findIndex((line) => line.trim().length > 0);
  if (firstIdx < 0) return { title: "", body: "" };
  const rawTitle = lines[firstIdx].trim().replace(/\*\*/g, "").replace(/`/g, "");
  const body = [...lines.slice(0, firstIdx), ...lines.slice(firstIdx + 1)].join("\n").replace(/^\s+|\s+$/g, "");
  return { title: rawTitle, body };
}

function ExerciseAgentButton({ actionContext, ex, index, lang }: { actionContext: MentorActionContext; ex: Exercise; index: number; lang: Lang }) {
  const t = siteCopy[lang].blocks.exercise;
  const copyT = siteCopy[lang].reader.copy;
  const [state, setState] = useState<"idle" | "done" | "fail">("idle");
  const copy = async () => {
    const action = buildExerciseMentorAction({ ...actionContext, exerciseIndex: index, level: ex.level, prompt: ex.prompt, checks: ex.checks, lang });
    try {
      await navigator.clipboard.writeText(buildMentorActionPrompt(action, lang));
      setState("done");
    } catch {
      setState("fail");
    }
    window.setTimeout(() => setState("idle"), 1600);
  };
  return (
    <button type="button" onClick={copy} aria-label={t.agentCopy.aria} className="exercise-agent">
      <CopyGlyph done={state === "done"} size={13} />
      <RollLabel state={state} idle={t.agentCopy.idle} done={copyT.copied} fail={copyT.failed} />
    </button>
  );
}

function Hint({ text, index, lang }: { text: string; index: number; lang: Lang }) {
  const t = siteCopy[lang].blocks.exercise;
  const [open, setOpen] = useState(false);
  return (
    <div className={open ? "exercise-hint is-open" : "exercise-hint"}>
      <button type="button" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
        <span className="caret" aria-hidden="true">▸</span>
        <span>{t.hint(index + 1)}</span>
      </button>
      <Reveal show={open}>
        <div className="hint-body"><Md className="reading-prose" lang={lang}>{text}</Md></div>
      </Reveal>
    </div>
  );
}

function Answer({ text, lang }: { text: string; lang: Lang }) {
  const t = siteCopy[lang].blocks.exercise;
  const [open, setOpen] = useState(false);
  return (
    <div className={open ? "exercise-answer is-open" : "exercise-answer"}>
      <button type="button" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
        <span className="caret" aria-hidden="true">▸</span>
        <span>{t.showAnswer}</span>
      </button>
      <Reveal show={open}>
        <div className="answer-body"><Md className="reading-prose" lang={lang}>{text}</Md></div>
      </Reveal>
    </div>
  );
}

function Card({ ex, index, actionContext, lang }: { ex: Exercise; index: number; actionContext?: MentorActionContext; lang: Lang }) {
  const t = siteCopy[lang].blocks.exercise;
  const [checked, setChecked] = useState<boolean[]>(ex.checks.map(() => false));
  const { title, body } = exerciseHeadline(ex.prompt);
  const displayTitle = title || t.untitled(index + 1);
  const num = String(index + 1).padStart(2, "0");

  return (
    <article className="exercise-card">
      <div className="exercise-head">
        <div className="exercise-identity">
          <div className="exercise-num">{num}</div>
          <h3 className="exercise-title">{displayTitle}</h3>
          {ex.level ? <span className="exercise-level">{ex.level}</span> : null}
        </div>
        {actionContext ? <ExerciseAgentButton actionContext={actionContext} ex={ex} index={index} lang={lang} /> : null}
      </div>
      {body ? <Md className="reading-prose exercise-prompt" lang={lang}>{body}</Md> : null}
      {(ex.hints.length > 0 || ex.answer) && (
        <div className="exercise-help">
          {ex.hints.map((h, i) => <Hint key={i} text={h} index={i} lang={lang} />)}
          {ex.answer && <Answer text={ex.answer} lang={lang} />}
        </div>
      )}
      {ex.checks.length > 0 && (
        <div className="exercise-checks">
          <div className="exercise-checks-label">{t.rubric}</div>
          {ex.checks.map((c, i) => (
            <label key={i} className={checked[i] ? "exercise-check is-done" : "exercise-check"}>
              <input type="checkbox" checked={checked[i]} onChange={() => setChecked((p) => p.map((v, j) => (j === i ? !v : v)))} />
              <span>{c}</span>
            </label>
          ))}
        </div>
      )}
    </article>
  );
}

export function ExerciseSection({ exercises, mentorActionContext, lang }: { exercises: Exercise[]; mentorActionContext?: MentorActionContext; lang: Lang }) {
  const t = siteCopy[lang].blocks.exercise;
  return (
    <section className="exercise-section">
      <h2 className="exercise-section-heading">{t.heading}</h2>
      {exercises.map((ex, i) => <Card key={i} ex={ex} index={i} actionContext={mentorActionContext} lang={lang} />)}
    </section>
  );
}
