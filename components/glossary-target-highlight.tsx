"use client";
import { useEffect } from "react";

export function GlossaryTargetHighlight() {
  useEffect(() => {
    if (!location.hash) return;
    const id = decodeURIComponent(location.hash.slice(1));
    const row = document.getElementById(id);
    if (!row) return;
    row.classList.add("glossary-target");
    row.scrollIntoView({ block: "center" });
  }, []);
  return null;
}