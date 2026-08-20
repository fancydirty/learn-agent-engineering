"use client";
import { useEffect, useRef, useState } from "react";
import { scrollDirection, type ScrollState } from "@/lib/scroll-direction";

const TOGGLE_DISTANCE = 40; // px scrolled from anchor before flipping state (prevents jitter)

export function StickyHeader({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<ScrollState>("shown");
  const anchorY = useRef(0); // Y-position where we last toggled state
  const ticking = useRef(false);
  const reduced = useRef(false);

  useEffect(() => {
    reduced.current = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    anchorY.current = window.scrollY;
    const headerHeight = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--sticky-header-height"));
    const onScroll = () => {
      if (reduced.current) return; // reduced motion: stay sticky, never hide
      if (ticking.current) return;
      ticking.current = true;
      requestAnimationFrame(() => {
        const nextY = window.scrollY;
        if (nextY <= headerHeight) {
          if (state !== "shown") { setState("shown"); anchorY.current = nextY; }
        } else {
          let newState = state;
          if (state === "shown" && nextY - anchorY.current >= TOGGLE_DISTANCE) {
            newState = "hidden";
          } else if (state === "hidden" && anchorY.current - nextY >= TOGGLE_DISTANCE) {
            newState = "shown";
          }
          if (newState !== state) { setState(newState); anchorY.current = nextY; }
        }
        ticking.current = false;
      });
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [state]);

  return (
    <div
      className="sticky top-0 z-40 transition-transform duration-200 motion-reduce:transition-none"
      style={{ transform: state === "hidden" ? "translateY(-100%)" : "translateY(0)" }}
    >
      {children}
    </div>
  );
}
