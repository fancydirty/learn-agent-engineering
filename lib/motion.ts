// Reader motion tokens: restrained, ease-out, no bounce.
export const DUR = 0.24;
export const EASE = [0.2, 0.7, 0.2, 1] as const;
export const RISE = 4;

// idle=row 0, done=row 1, fail=row 2 — RollLabel vertical scroll row index (unit-testable)
export function stateRow(state: "idle" | "done" | "fail"): number {
  return state === "done" ? 1 : state === "fail" ? 2 : 0;
}

// Pure fn: given reduced-motion, produce <Reveal> motion props (unit-testable, no DOM).
export function revealMotion(reduced: boolean) {
  const y = reduced ? 0 : -RISE;
  return {
    initial: { height: 0, opacity: 0, y },
    animate: { height: "auto" as const, opacity: 1, y: 0 },
    exit: { height: 0, opacity: 0, y },
    transition: reduced ? { duration: 0 } : { duration: DUR, ease: EASE },
  };
}
