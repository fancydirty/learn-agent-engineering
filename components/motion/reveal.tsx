"use client";
import type { ReactNode } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { revealMotion } from "@/lib/motion";

// Vertical expand + fade-up enter/exit. Reused for blocks that reveal feedback only after submit.
export function Reveal({ show, children, className }: { show: boolean; children: ReactNode; className?: string }) {
  const reduced = useReducedMotion() ?? false;
  const m = revealMotion(reduced);
  return (
    <AnimatePresence initial={false}>
      {show ? (
        <motion.div
          className={className}
          initial={m.initial}
          animate={m.animate}
          exit={m.exit}
          transition={m.transition}
          style={{ overflow: "hidden" }}
        >
          {children}
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
