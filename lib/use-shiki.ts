"use client";
import { useEffect, useState } from "react";
import type { TokenizeResult } from "@/lib/shiki-highlighter";
import type { CodeExerciseSlotPart } from "@/lib/code-exercises";
import type { SlotRenderPart } from "@/lib/slot-highlight";
import { displayLangFor } from "@/lib/shiki-langs";

// Shiki (263KB) and slot-highlight share this client-only dynamic import entry:
// first paint is uncolored fallback; chunk load re-renders with color (same text/lines, zero CLS).
// Module-level cache → one chunk site-wide, no re-download across routes.
type ShikiMod = typeof import("@/lib/shiki-highlighter");
let shikiMod: ShikiMod | null = null;
let shikiPromise: Promise<ShikiMod> | null = null;

function loadShiki(): Promise<ShikiMod> {
  return (shikiPromise ??= import("@/lib/shiki-highlighter").then(
    (m) => (shikiMod = m),
    (err) => {
      shikiPromise = null; // retry on next mount instead of pinning the session on a rejected promise
      throw err;
    },
  ));
}

export function useShiki(): ShikiMod | null {
  const [mod, setMod] = useState<ShikiMod | null>(shikiMod);
  useEffect(() => {
    if (shikiMod) return;
    let alive = true;
    loadShiki().then((m) => { if (alive) setMod(m); }, () => {});
    return () => { alive = false; };
  }, []);
  return mod;
}

export function plainTokens(code: string, language: string): TokenizeResult {
  return {
    tokens: code.split("\n").map((line) => [{ content: line }]),
    displayLang: displayLangFor(language),
  };
}

type SlotMod = typeof import("@/lib/slot-highlight");
let slotMod: SlotMod | null = null;
let slotPromise: Promise<SlotMod> | null = null;

function loadSlotHighlight(): Promise<SlotMod> {
  return (slotPromise ??= import("@/lib/slot-highlight").then(
    (m) => (slotMod = m),
    (err) => {
      slotPromise = null; // retry on next mount instead of pinning the session on a rejected promise
      throw err;
    },
  ));
}

export function useSlotHighlight(): SlotMod | null {
  const [mod, setMod] = useState<SlotMod | null>(slotMod);
  useEffect(() => {
    if (slotMod) return;
    let alive = true;
    loadSlotHighlight().then((m) => { if (alive) setMod(m); }, () => {});
    return () => { alive = false; };
  }, []);
  return mod;
}

export function plainSlotParts(parts: CodeExerciseSlotPart[]): SlotRenderPart[] {
  return parts.map((p) =>
    p.type === "slot"
      ? { type: "slot", index: p.index, placeholder: p.placeholder }
      : { type: "code", runs: [{ text: p.text }] },
  );
}
