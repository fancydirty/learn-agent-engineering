"use client";

import { useMemo, useState } from "react";
import {
  buildTracePrompt,
  initialTraceValues,
  runTraceChecks,
  traceCellKey,
  type TraceBlock as TraceBlockData,
} from "@/lib/learning-interactions";
import type { MentorActionContext } from "@/lib/mentor-actions";
import type { Lang } from "@/lib/i18n";
import { siteCopy } from "@/lib/site-copy";
import { InteractiveCardShell } from "./interactive-card-shell";
import { Reveal } from "@/components/motion/reveal";
import { RollLabel } from "@/components/motion/roll-label";
import { CodeBlock } from "@/components/code-block";

export function TraceTableBlock({
  block,
  mentorActionContext,
  lang,
}: {
  block: TraceBlockData;
  mentorActionContext?: MentorActionContext;
  lang: Lang;
}) {
  const common = siteCopy[lang].blocks.common;
  const traceT = siteCopy[lang].blocks.trace;
  const copyT = siteCopy[lang].reader.copy;
  const [values, setValues] = useState<Record<string, string>>(() => initialTraceValues(block));
  const [hasChecked, setHasChecked] = useState(false);
  const [copyState, setCopyState] = useState<"idle" | "done" | "fail">("idle");
  const results = useMemo(() => runTraceChecks(block, values), [block, values]);
  const resultByKey = useMemo(() => {
    const next = new Map<string, { passed: boolean; given: boolean }>();
    for (const result of results) {
      next.set(traceCellKey(result.rowId, result.columnId), { passed: result.passed, given: result.given });
    }
    return next;
  }, [results]);
  const editableResults = results.filter((result) => !result.given);
  const passed = editableResults.filter((result) => result.passed).length;
  const allPassed = editableResults.length > 0 && passed === editableResults.length;

  const checkAnswers = () => {
    setHasChecked(true);
  };

  const reset = () => {
    setValues(initialTraceValues(block));
    setHasChecked(false);
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(buildTracePrompt(block, values, results, lang, mentorActionContext));
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
      <div className="trace-table-wrap">
        <table className="trace-table">
          <thead>
            <tr>
              <th scope="col">{traceT.stepColumn}</th>
              {block.columns.map((column) => (
                <th key={column.id} scope="col">{column.label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {block.rows.map((row) => (
              <tr key={row.id}>
                <th scope="row">{row.label}</th>
                {row.cells.map((cell) => {
                  const key = traceCellKey(row.id, cell.columnId);
                  const result = resultByKey.get(key);
                  const statusClass = hasChecked && result && !result.given
                    ? result.passed ? " is-correct" : " is-wrong"
                    : "";

                  return (
                    <td key={key}>
                      {cell.given ? (
                        <span className="trace-cell-given">{cell.answer}</span>
                      ) : (
                        <>
                          <input
                            className={`trace-cell-input${statusClass}`}
                            value={values[key] ?? ""}
                            onChange={(event) => {
                              const value = event.target.value;
                              setValues((prev) => ({ ...prev, [key]: value }));
                              setHasChecked(false);
                            }}
                            aria-label={`${row.label} ${cell.columnId}`}
                          />
                          {hasChecked && result ? (
                            <span className={`trace-cell-status${result.passed ? " is-correct" : " is-wrong"}`}>
                              {result.passed ? traceT.cellPassed : traceT.cellRetry}
                            </span>
                          ) : null}
                        </>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Reveal show={hasChecked}>
        <div
          className={allPassed ? "learning-summary is-correct" : "learning-summary is-wrong"}
          aria-live="polite"
        >
          {allPassed ? traceT.allFilled : traceT.partialFilled(passed, editableResults.length)}
          {" "}
          {allPassed ? block.feedbackCorrect : block.feedbackWrong}
        </div>
      </Reveal>

      <div className="interactive-actions">
        <button type="button" onClick={checkAnswers}>{common.check}</button>
        <button type="button" onClick={reset}>{common.reset}</button>
        <button type="button" onClick={copy}>
          <RollLabel state={copyState} idle={common.copyToAgent} done={copyT.copied} fail={copyT.failed} />
        </button>
      </div>
    </InteractiveCardShell>
  );
}
