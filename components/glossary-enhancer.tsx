"use client";
import { useEffect } from "react";
import { segmentText, type Term } from "@/lib/glossary";
import { siteCopy } from "@/lib/site-copy";
import type { Lang } from "@/lib/i18n";
import { buildGlossaryDrillPrompt, type DrillContext } from "@/lib/drilldown";

const SKIP = new Set(["CODE", "PRE", "A", "H1", "H2", "H3", "H4", "H5", "H6", "SUMMARY", "BUTTON"]);

// hideTimer must be module-level: effect re-runs leave stale span handlers; shared slot fixes drilldown e2e bug.
let hideTimer = 0;

export function GlossaryEnhancer({ terms, lang, drill }: { terms: Term[]; lang?: Lang; drill?: { ctx: DrillContext; lang: Lang } }) {
  useEffect(() => {
    if (!terms.length) return;
    const root = document.querySelector<HTMLElement>(".reading-prose");
    if (!root) return;
    const uiLang: Lang = lang ?? drill?.lang ?? "zh";
    const copy = siteCopy[uiLang].drill;
    const byName = new Map(terms.map((t) => [t.term, t]));
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let tip = document.getElementById("glossary-tip") as HTMLDivElement | null;
    if (!tip) {
      tip = document.createElement("div");
      tip.id = "glossary-tip";
      tip.style.cssText =
        "position:fixed;z-index:50;max-width:280px;padding:10px 12px;font-size:13px;line-height:1.5;background:var(--card);color:var(--foreground);border:0.5px solid var(--border);border-radius:var(--radius-md);box-shadow:var(--shadow-card);pointer-events:auto;opacity:0;transition:opacity .12s;";
      document.body.appendChild(tip);
    }
    // tip singleton on body: property handlers replace old closures on remount.
    const onTipMouseEnter = () => window.clearTimeout(hideTimer);
    const onTipMouseLeave = () => hide();
    tip.onmouseenter = onTipMouseEnter;
    tip.onmouseleave = onTipMouseLeave;
    // keyboard parity: focus in card clears hide timer (cast for focusin/out types).
    const tipFocus = tip as HTMLDivElement & { onfocusin: (() => void) | null; onfocusout: (() => void) | null };
    const onTipFocusIn = () => window.clearTimeout(hideTimer);
    const onTipFocusOut = () => hide();
    tipFocus.onfocusin = onTipFocusIn;
    tipFocus.onfocusout = onTipFocusOut;
    const resetTimers = new Set<number>();
    const position = (anchor: HTMLElement) => {
      const r = anchor.getBoundingClientRect();
      tip!.style.opacity = "1";
      tip!.style.top = `${r.bottom + 4}px`;
      tip!.style.left = `${Math.max(8, Math.min(r.left, window.innerWidth - 296))}px`;
    };
    // card layers: def → deeper → related chips; live entries always show unverified badge.
    const renderCard = (t: Term, anchor: HTMLElement) => {
      window.clearTimeout(hideTimer);
      tip!.textContent = "";
      tip!.style.pointerEvents = "auto";
      if (t.origin === "live") {
        const badge = document.createElement("span");
        badge.className = "glossary-tip-live";
        badge.textContent = copy.liveBadge;
        tip!.appendChild(badge);
      }
      const def = document.createElement("div");
      def.className = "glossary-tip-def";
      def.textContent = t.def;
      tip!.appendChild(def);
      if (t.deeper) {
        const deeperDiv = document.createElement("div");
        deeperDiv.className = "glossary-tip-deeper";
        // Strip [^Sn] from deeper display — sources live on glossary page
        deeperDiv.textContent = t.deeper.replace(/\s*\[\^S\d+\]/gi, "");
        if (reduced) {
          tip!.appendChild(deeperDiv);
        } else {
          const btn = document.createElement("button");
          btn.type = "button";
          btn.className = "glossary-tip-deeper-btn";
          btn.textContent = copy.deeper;
          btn.addEventListener("click", () => {
            window.clearTimeout(hideTimer);
            btn.replaceWith(deeperDiv);
            position(anchor);
          });
          tip!.appendChild(btn);
        }
      }
      const related = (t.related ?? []).map((r) => byName.get(r)).filter((rt): rt is Term => Boolean(rt));
      if (related.length) {
        const row = document.createElement("div");
        row.className = "glossary-tip-related";
        for (const rt of related) {
          const chip = document.createElement("button");
          chip.type = "button";
          chip.className = "glossary-tip-chip";
          chip.textContent = rt.term;
          chip.addEventListener("click", () => renderCard(rt, anchor));
          row.appendChild(chip);
        }
        tip!.appendChild(row);
      }
      if (drill) {
        const action = document.createElement("div");
        action.className = "glossary-tip-action";
        action.textContent = copy.glossaryMore;
        action.addEventListener("click", async () => {
          try {
            await navigator.clipboard.writeText(buildGlossaryDrillPrompt(t.term, t.def, drill.ctx, drill.lang));
            action.textContent = copy.copied;
          } catch {
            action.textContent = copy.copyFail;
          }
          const resetTimer = window.setTimeout(() => {
            resetTimers.delete(resetTimer);
            action.textContent = copy.glossaryMore;
          }, 1200);
          resetTimers.add(resetTimer);
        });
        tip!.appendChild(action);
      }
      position(anchor);
    };
    const show = (el: HTMLElement) => {
      // dataset.term is identity; legacy spans fall back to textContent/def
      const t = byName.get(el.dataset.term || el.textContent || "") ?? { term: el.textContent || "", def: el.dataset.def || "" };
      renderCard(t, el);
    };
    function hide() {
      hideTimer = window.setTimeout(() => {
        if (tip) {
          tip.style.opacity = "0";
          tip.style.pointerEvents = "none";
        }
      }, 300);
    }

    const used = new Set<string>();
    root.querySelectorAll<HTMLElement>(".glossary-term[data-term]").forEach((term) => {
      used.add(term.dataset.term!);
    });
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode(n) {
        let p = (n as Text).parentElement;
        while (p && p !== root) {
          if (SKIP.has(p.tagName) || p.classList.contains("glossary-term") || p.closest("[data-footnotes]"))
            return NodeFilter.FILTER_REJECT;
          p = p.parentElement;
        }
        return n.nodeValue && n.nodeValue.trim() ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
      },
    });
    const nodes: Text[] = [];
    let cur: Node | null;
    while ((cur = walker.nextNode())) nodes.push(cur as Text);

    for (const node of nodes) {
      const segs = segmentText(node.nodeValue || "", terms, used);
      if (segs.length === 1 && !segs[0].def) continue;
      const frag = document.createDocumentFragment();
      for (const s of segs) {
        if (s.def) {
          const span = document.createElement("span");
          span.className = "glossary-term";
          span.dataset.def = s.def;
          if (s.term) span.dataset.term = s.term;
          span.tabIndex = 0;
          span.textContent = s.text;
          frag.appendChild(span);
        } else {
          frag.appendChild(document.createTextNode(s.text));
        }
      }
      node.parentNode?.replaceChild(frag, node);
    }

    const termFromEvent = (event: Event) => {
      const target = event.target instanceof Element ? event.target.closest<HTMLElement>(".glossary-term") : null;
      return target && root.contains(target) ? target : null;
    };
    const onMouseOver = (event: MouseEvent) => {
      const term = termFromEvent(event);
      if (term && !(event.relatedTarget instanceof Node && term.contains(event.relatedTarget))) show(term);
    };
    const onMouseOut = (event: MouseEvent) => {
      const term = termFromEvent(event);
      if (term && !(event.relatedTarget instanceof Node && term.contains(event.relatedTarget))) hide();
    };
    const onFocusIn = (event: FocusEvent) => { const term = termFromEvent(event); if (term) show(term); };
    const onFocusOut = (event: FocusEvent) => { const term = termFromEvent(event); if (term) hide(); };
    root.addEventListener("mouseover", onMouseOver);
    root.addEventListener("mouseout", onMouseOut);
    root.addEventListener("focusin", onFocusIn);
    root.addEventListener("focusout", onFocusOut);
    // cleanup: clear hide timer and hide immediately (no new hide() schedule)
    return () => {
      root.removeEventListener("mouseover", onMouseOver);
      root.removeEventListener("mouseout", onMouseOut);
      root.removeEventListener("focusin", onFocusIn);
      root.removeEventListener("focusout", onFocusOut);
      window.clearTimeout(hideTimer);
      resetTimers.forEach((timer) => window.clearTimeout(timer));
      if (tip) {
        const ownsTip = tip.onmouseenter === onTipMouseEnter
          && tip.onmouseleave === onTipMouseLeave
          && tipFocus.onfocusin === onTipFocusIn
          && tipFocus.onfocusout === onTipFocusOut;
        if (ownsTip) {
          tip.onmouseenter = null;
          tip.onmouseleave = null;
          tipFocus.onfocusin = null;
          tipFocus.onfocusout = null;
          tip.textContent = "";
        }
        tip.style.opacity = "0";
        tip.style.pointerEvents = "none";
      }
    };
  }, [terms, lang, drill]);
  return null;
}
