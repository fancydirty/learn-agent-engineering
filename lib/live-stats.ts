// course-reader/lib/live-stats.ts
// Live block local learning telemetry: counts only, no network upload. statsSummaryLines produces the "Learning process" section for copy-to-agent.
import type { LiveFiles } from "./live-sandbox";
import type { Lang } from "./i18n";
import type { Locale } from "./locales";
import { changedLineNumbers } from "./live-sandbox-ui";

export interface LiveStats {
  resets: number;
  solutionViews: number;
  edits: number;
  firstEditTs: number | null;
  lastEditTs: number | null;
  achievedTs: number | null;
}

export function emptyStats(): LiveStats {
  return { resets: 0, solutionViews: 0, edits: 0, firstEditTs: null, lastEditTs: null, achievedTs: null };
}

export function bumpStat(s: LiveStats, key: "resets" | "solutionViews" | "edits"): LiveStats {
  return { ...s, [key]: s[key] + 1 };
}

export function markEdit(s: LiveStats, now: number): LiveStats {
  return { ...s, edits: s.edits + 1, firstEditTs: s.firstEditTs ?? now, lastEditTs: now };
}

// Copy for the "Learning process" section in copy-to-agent prompts; keyed by locale (same as site-copy.ts).
const COPY: Record<Locale, {
  learningProcess: string;
  goalAchieved: string;
  goalAchievedTime: (mins: number) => string;
  goalNotAchieved: string;
  editedTimes: (n: number) => string;
  editDuration: (mins: number) => string;
  resetLine: (resets: number, solutionViews: number) => string;
  diffEntry: (file: string, lines: number) => string;
  diffJoin: string;
  diffLine: (joined: string) => string;
}> = {
  zh: {
    learningProcess: "学习过程:",
    goalAchieved: "- 目标：已达成",
    goalAchievedTime: (mins) => `（用时约 ${mins} 分钟，自首次编辑起）`,
    goalNotAchieved: "- 目标：尚未达成",
    editedTimes: (n) => `- 编辑了 ${n} 次`,
    editDuration: (mins) => `,持续约 ${mins} 分钟`,
    resetLine: (resets, solutionViews) => `- 重置 ${resets} 次;看参考答案 ${solutionViews} 次`,
    diffEntry: (file, lines) => `${file} ${lines} 行`,
    diffJoin: "、",
    diffLine: (joined) => `- 当前代码与参考答案差异: ${joined}`,
  },
  en: {
    learningProcess: "Learning process:",
    goalAchieved: "- Goal: achieved",
    goalAchievedTime: (mins) => ` (about ${mins} min from first edit)`,
    goalNotAchieved: "- Goal: not achieved yet",
    editedTimes: (n) => `- Edited ${n} times`,
    editDuration: (mins) => `, over about ${mins} min`,
    resetLine: (resets, solutionViews) => `- ${resets} resets; viewed the solution ${solutionViews} times`,
    diffEntry: (file, lines) => `${file} ${lines} lines`,
    diffJoin: ", ",
    diffLine: (joined) => `- Differences from the solution: ${joined}`,
  },
  ja: {
    learningProcess: "学習の経過:",
    goalAchieved: "- 目標：達成済み",
    goalAchievedTime: (mins) => `（最初の編集から約 ${mins} 分）`,
    goalNotAchieved: "- 目標：未達成",
    editedTimes: (n) => `- ${n} 回編集`,
    editDuration: (mins) => `、約 ${mins} 分間`,
    resetLine: (resets, solutionViews) => `- リセット ${resets} 回；解答例の閲覧 ${solutionViews} 回`,
    diffEntry: (file, lines) => `${file} ${lines} 行`,
    diffJoin: "、",
    diffLine: (joined) => `- 現在のコードと解答例の差分: ${joined}`,
  },
  ko: {
    learningProcess: "학습 과정:",
    goalAchieved: "- 목표: 달성",
    goalAchievedTime: (mins) => ` (첫 편집 이후 약 ${mins}분)`,
    goalNotAchieved: "- 목표: 아직 미달성",
    editedTimes: (n) => `- ${n}회 편집`,
    editDuration: (mins) => `, 약 ${mins}분 동안`,
    resetLine: (resets, solutionViews) => `- 초기화 ${resets}회; 해답 확인 ${solutionViews}회`,
    diffEntry: (file, lines) => `${file} ${lines}줄`,
    diffJoin: ", ",
    diffLine: (joined) => `- 현재 코드와 해답의 차이: ${joined}`,
  },
  es: {
    learningProcess: "Proceso de aprendizaje:",
    goalAchieved: "- Objetivo: alcanzado",
    goalAchievedTime: (mins) => ` (unos ${mins} min desde la primera edición)`,
    goalNotAchieved: "- Objetivo: aún no alcanzado",
    editedTimes: (n) => `- ${n} ediciones`,
    editDuration: (mins) => `, durante unos ${mins} min`,
    resetLine: (resets, solutionViews) => `- ${resets} reinicios; solución consultada ${solutionViews} veces`,
    diffEntry: (file, lines) => `${file} ${lines} líneas`,
    diffJoin: ", ",
    diffLine: (joined) => `- Diferencias con la solución: ${joined}`,
  },
  "pt-BR": {
    learningProcess: "Processo de aprendizagem:",
    goalAchieved: "- Objetivo: alcançado",
    goalAchievedTime: (mins) => ` (cerca de ${mins} min desde a primeira edição)`,
    goalNotAchieved: "- Objetivo: ainda não alcançado",
    editedTimes: (n) => `- ${n} edições`,
    editDuration: (mins) => `, ao longo de cerca de ${mins} min`,
    resetLine: (resets, solutionViews) => `- ${resets} redefinições; solução consultada ${solutionViews} vezes`,
    diffEntry: (file, lines) => `${file} ${lines} linhas`,
    diffJoin: ", ",
    diffLine: (joined) => `- Diferenças em relação à solução: ${joined}`,
  },
};

// "Learning process" section for copy-to-agent. All zeros (no activity) → [], don't feed agent empty filler.
export function statsSummaryLines(s: LiveStats, currentFiles: LiveFiles, solution: Partial<LiveFiles>, hasChecks = false, lang: Lang = "zh"): string[] {
  if (s.edits === 0 && s.resets === 0 && s.solutionViews === 0) return [];
  const t = COPY[lang];
  const lines = [t.learningProcess];
  if (hasChecks) {
    if (s.achievedTs !== null) {
      let l = t.goalAchieved;
      if (s.firstEditTs !== null) {
        const mins = Math.floor((s.achievedTs - s.firstEditTs) / 60_000);
        if (mins >= 1) l += t.goalAchievedTime(mins);
      }
      lines.push(l);
    } else {
      lines.push(t.goalNotAchieved);
    }
  }
  let editLine = t.editedTimes(s.edits);
  if (s.firstEditTs !== null && s.lastEditTs !== null) {
    const mins = Math.floor((s.lastEditTs - s.firstEditTs) / 60_000);
    if (mins >= 1) editLine += t.editDuration(mins);
  }
  lines.push(editLine);
  lines.push(t.resetLine(s.resets, s.solutionViews));
  const diffs: string[] = [];
  for (const k of ["html", "css", "js"] as const) {
    const sol = solution[k];
    if (typeof sol === "string") {
      const n = changedLineNumbers(currentFiles[k], sol).length;
      if (n > 0) diffs.push(t.diffEntry(k, n));
    }
  }
  if (diffs.length) lines.push(t.diffLine(diffs.join(t.diffJoin)));
  return lines;
}
