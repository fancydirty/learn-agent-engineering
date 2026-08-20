"use client";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";

// Copy-button glyph: copy ↔ check pop-in swap. Owns only the size square, not button chrome or label text.
export function CopyGlyph({ done, size = 14 }: { done: boolean; size?: number }) {
  const reduced = useReducedMotion() ?? false;
  const t = reduced ? { duration: 0 } : { duration: 0.22, ease: [0.2, 0.9, 0.3, 1.4] as const };
  const common = { width: size, height: size, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", "aria-hidden": true, style: { position: "absolute" as const, inset: 0 } };
  return (
    <span style={{ position: "relative", display: "inline-flex", width: size, height: size }}>
      <AnimatePresence initial={false} mode="popLayout">
        {done ? (
          <motion.svg key="chk" {...common} strokeWidth={2.2} initial={{ scale: 0.4, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.4, opacity: 0 }} transition={t}>
            <path d="M20 6 9 17l-5-5" />
          </motion.svg>
        ) : (
          <motion.svg key="cpy" {...common} strokeWidth={1.8} initial={{ scale: 0.4, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.4, opacity: 0 }} transition={t}>
            <rect x="9" y="9" width="11" height="11" rx="2" />
            <path d="M5 15V5a2 2 0 0 1 2-2h10" />
          </motion.svg>
        )}
      </AnimatePresence>
    </span>
  );
}
