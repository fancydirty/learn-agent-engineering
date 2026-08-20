export interface LiveFiles { html: string; css: string; js: string; }
export interface LiveChoiceItem { label: string; code: string; }
export interface LiveChoices {
  target: keyof LiveFiles;
  intro?: string;
  items: LiveChoiceItem[];
}
export interface LiveCheck {
  selector: string;
  css?: Record<string, string>;
  text?: string;
  count?: number;
}
export interface LiveBlock {
  id: string; label: string; goal: string;
  v: number; // contract version, default 1
  files: LiveFiles;
  solution: Partial<LiveFiles>;
  copyPurpose: string;
  choices?: LiveChoices;
  checks?: LiveCheck[];
}
export type LiveParseResult = { ok: true; block: LiveBlock } | { ok: false; error: string };

// Supported live contract versions in toolchain. Version bump rules: course-authoring-guide.md —
// optional fields = no bump; semantic change/new required/removed fields = bump.
// scripts/course-guard.mjs mirrors this constant (mjs cannot import here); keep in sync.
export const SUPPORTED_LIVE_VERSIONS: readonly number[] = [1];

const MAX_FILE_BYTES = 4096;
const EXTERNAL_URL = /https?:\/\//i;
const KEYS: (keyof LiveFiles)[] = ["html", "css", "js"];

function s(v: unknown): string { return typeof v === "string" ? v : ""; }

export function parseLiveBlock(code: string): LiveParseResult {
  let raw: unknown;
  try { raw = JSON.parse(code); } catch (e) { return { ok: false, error: `agentmentor-live JSON parse failed: ${e instanceof Error ? e.message : String(e)}` }; }
  if (typeof raw !== "object" || raw === null) return { ok: false, error: "agentmentor-live must be a JSON object" };
  const r = raw as Record<string, unknown>;
  const filesIn = (typeof r.files === "object" && r.files) ? r.files as Record<string, unknown> : {};
  const solIn = (typeof r.solution === "object" && r.solution) ? r.solution as Record<string, unknown> : {};
  const solution: Partial<LiveFiles> = {};
  for (const k of KEYS) if (typeof solIn[k] === "string") solution[k] = solIn[k] as string;
  let v = 1;
  if (r.v !== undefined) {
    if (typeof r.v !== "number" || !Number.isInteger(r.v) || r.v < 1) {
      return { ok: false, error: "agentmentor-live v must be a positive integer" };
    }
    v = r.v;
  }
  let choices: LiveChoices | undefined;
  if (r.choices !== undefined) {
    const c = r.choices as Record<string, unknown>;
    if (typeof c !== "object" || c === null || Array.isArray(c)) {
      return { ok: false, error: "agentmentor-live choices must be an object" };
    }
    if (c.target !== "html" && c.target !== "css" && c.target !== "js") {
      return { ok: false, error: "agentmentor-live choices.target must be html/css/js" };
    }
    if (!Array.isArray(c.items)) {
      return { ok: false, error: "agentmentor-live choices.items must be an array" };
    }
    const items: LiveChoiceItem[] = [];
    for (const it of c.items) {
      const o = it as Record<string, unknown>;
      if (typeof o !== "object" || o === null || typeof o.label !== "string" || typeof o.code !== "string") {
        return { ok: false, error: "agentmentor-live choices.items each need label/code strings" };
      }
      items.push({ label: o.label, code: o.code });
    }
    choices = {
      target: c.target,
      items,
      ...(typeof c.intro === "string" && c.intro ? { intro: c.intro } : {}),
    };
  }
  let checks: LiveCheck[] | undefined;
  if (r.checks !== undefined) {
    if (!Array.isArray(r.checks)) return { ok: false, error: "agentmentor-live checks must be an array" };
    const list: LiveCheck[] = [];
    for (const it of r.checks) {
      const o = it as Record<string, unknown>;
      if (typeof o !== "object" || o === null || typeof o.selector !== "string") {
        return { ok: false, error: "agentmentor-live checks each need selector string" };
      }
      const one: LiveCheck = { selector: o.selector };
      if (o.css !== undefined) {
        if (typeof o.css !== "object" || o.css === null || Array.isArray(o.css)) {
          return { ok: false, error: "agentmentor-live checks css must be an object" };
        }
        const cssObj: Record<string, string> = {};
        for (const [k, v] of Object.entries(o.css)) {
          if (typeof v !== "string") return { ok: false, error: "agentmentor-live checks css values must be strings" };
          cssObj[k] = v;
        }
        one.css = cssObj;
      }
      if (o.text !== undefined) {
        if (typeof o.text !== "string") return { ok: false, error: "agentmentor-live checks text must be a string" };
        one.text = o.text;
      }
      if (o.count !== undefined) {
        if (typeof o.count !== "number" || !Number.isInteger(o.count)) {
          return { ok: false, error: "agentmentor-live checks count must be an integer" };
        }
        one.count = o.count;
      }
      list.push(one);
    }
    checks = list;
  }
  return {
    ok: true,
    block: {
      id: s(r.id), label: s(r.label), goal: s(r.goal),
      v,
      files: { html: s(filesIn.html), css: s(filesIn.css), js: s(filesIn.js) },
      solution,
      copyPurpose: s(r.copyPurpose),
      ...(choices ? { choices } : {}),
      ...(checks ? { checks } : {}),
    },
  };
}

export function validateLiveBlock(b: LiveBlock): string[] {
  const errors: string[] = [];
  if (!SUPPORTED_LIVE_VERSIONS.includes(b.v)) {
    errors.push(`This block requires a reader update (block version v${b.v})`);
  }
  if (!b.id) errors.push("agentmentor-live missing id");
  if (!b.label) errors.push("agentmentor-live missing label");
  if (!b.goal) errors.push("agentmentor-live missing goal (one-line objective)");
  if (!b.copyPurpose) errors.push("agentmentor-live missing copyPurpose");
  const present = KEYS.filter((k) => b.files[k].trim().length > 0);
  if (present.length === 0) errors.push("agentmentor-live files need at least one non-empty segment (html/css/js)");
  for (const k of KEYS) {
    if (Buffer.byteLength(b.files[k], "utf8") > MAX_FILE_BYTES) errors.push(`agentmentor-live files.${k} exceeds ${MAX_FILE_BYTES} bytes`);
    if (b.files[k] && EXTERNAL_URL.test(b.files[k])) errors.push(`agentmentor-live files.${k} contains external URL (must be self-contained, no external links)`);
  }
  for (const k of Object.keys(b.solution) as (keyof LiveFiles)[]) {
    if (!b.files[k] || !b.files[k].trim()) errors.push(`agentmentor-live solution.${k} requires non-empty files.${k}`);
    const v = b.solution[k] || "";
    if (Buffer.byteLength(v, "utf8") > MAX_FILE_BYTES) errors.push(`agentmentor-live solution.${k} exceeds ${MAX_FILE_BYTES} bytes`);
    if (EXTERNAL_URL.test(v)) errors.push(`agentmentor-live solution.${k} contains external URL`);
  }
  if (b.choices) {
    const c = b.choices;
    if (!b.files[c.target] || !b.files[c.target].trim()) {
      errors.push(`agentmentor-live choices.target files.${c.target} missing or empty`);
    }
    if (c.items.length < 2 || c.items.length > 6) {
      errors.push("agentmentor-live choices.items must be 2-6");
    }
    const seen = new Set<string>();
    for (const it of c.items) {
      if (!it.label.trim() || it.label.length > 24) errors.push("agentmentor-live choices label must be non-empty and ≤24 chars");
      if (seen.has(it.label)) errors.push(`agentmentor-live choices label "${it.label}" must be unique`);
      seen.add(it.label);
      if (Buffer.byteLength(it.code, "utf8") > 1024) errors.push("agentmentor-live choices code exceeds 1024 bytes");
      if (EXTERNAL_URL.test(it.code)) errors.push("agentmentor-live choices code contains external URL");
    }
    if (c.intro && c.intro.length > 120) errors.push("agentmentor-live choices intro exceeds 120 chars");
  }
  if (b.checks) {
    if (b.checks.length < 1 || b.checks.length > 8) errors.push("agentmentor-live checks must be 1-8");
    for (const c of b.checks) {
      if (!c.selector.trim() || c.selector.length > 200) errors.push("agentmentor-live checks selector must be non-empty and ≤200 chars");
      if (c.css === undefined && c.text === undefined && c.count === undefined) {
        errors.push("agentmentor-live checks each need at least one of css/text/count");
      }
      if (c.css) {
        for (const [k, v] of Object.entries(c.css)) {
          if (!k.trim() || !v.trim()) errors.push("agentmentor-live checks css keys/values must be non-empty");
        }
      }
      if (c.count !== undefined && c.count < 1) errors.push("agentmentor-live checks count must be a positive integer");
    }
  }
  return errors;
}

// Lightweight loop guard (best-effort): regex injects counter into while/for; not AST, blocks common while(true)/for(;;).
export function injectLoopGuard(js: string): string {
  // zh literal on purpose — export/html.ts swaps via html-copy loopGuard for en courses.
  const header = "let __guard=0;const __tick=()=>{if(++__guard>1e6)throw new Error('循环次数过多,已中断');};";
  const guarded = js.replace(/\b(while|for)\s*\(([^)]*)\)\s*\{/g, (_m, kw, cond) => `${kw}(${cond}){__tick();`);
  return `${header}\n${guarded}`;
}

// Shared by reader and export: build full HTML doc, inject console/error capture + height postMessage to parent + loop guard.
// NOTE: serialized via Function.prototype.toString() into export HTML; do not reference module identifiers except injectLoopGuard.
export function buildSrcdoc(
  files: { html?: string; css?: string; js?: string },
  opts?: { instanceId?: string; checks?: LiveCheck[] },
): string {
  const html = files.html || "";
  const css = (files.css || "").replace(/<\//g, "<\\/");
  const js = injectLoopGuard(files.js || "").replace(/<\/script/gi, "<\\/script");
  const checksJson = opts && opts.checks && opts.checks.length
    ? JSON.stringify(opts.checks).replace(/</g, "\\u003c")
    : "null";
  const capture = [
    "(function(){",
    `var ID=${JSON.stringify(opts && opts.instanceId ? opts.instanceId : "")};`,
    "var send=function(p){p.__amLive=true;p.id=ID;try{parent.postMessage(p,'*')}catch(e){}};",
    "window.addEventListener('error',function(e){send({level:'error',msg:String(e.message||(e.error&&e.error.message)||'未知错误')})});",
    "['log','warn','error'].forEach(function(m){var o=console[m];console[m]=function(){o.apply(console,arguments);send({level:m,msg:Array.prototype.join.call(arguments,' ')})}});",
    "var lastH=0;var report=function(){var h=document.documentElement.scrollHeight;if(h&&h!==lastH){lastH=h;send({type:'height',h:h})}};",
    "if(window.ResizeObserver){new ResizeObserver(report).observe(document.documentElement)}",
    "window.addEventListener('load',report);",
    `var CHECKS=${checksJson};`,
    "function __amRunChecks(){if(!CHECKS||!CHECKS.length)return;var res=[];var pass=true;for(var i=0;i<CHECKS.length;i++){var c=CHECKS[i];var ok=false;try{var els=document.querySelectorAll(c.selector);ok=els.length>0;if(ok&&typeof c.count==='number')ok=els.length===c.count;var el=els[0];if(ok&&c.css&&el){var cs=getComputedStyle(el);for(var k in c.css){if(String(cs.getPropertyValue(k)).trim()!==String(c.css[k]).trim()){ok=false;break}}}if(ok&&typeof c.text==='string'&&el){ok=(el.textContent||'').indexOf(c.text)>=0}}catch(e){ok=false}res.push(ok);if(!ok)pass=false}send({type:'checks',pass:pass,results:res})}",
    "window.addEventListener('load',__amRunChecks);",
    "if(CHECKS&&CHECKS.length&&window.MutationObserver){var __amCkT=null;new MutationObserver(function(){clearTimeout(__amCkT);__amCkT=setTimeout(__amRunChecks,150)}).observe(document.documentElement,{subtree:true,childList:true,characterData:true,attributes:true})}",
    "window.addEventListener('message',function(e){",
    "if(e.source!==window.parent||!e.data||!e.data.__amLiveCmd)return;",
    "if(e.data.__amLiveCmd==='eval'){try{var r=(0,eval)(e.data.code);console.log(r)}catch(err){console.error(String(err))}return}",
    "if(e.data.__amLiveCmd==='inspect'){__amSetInspect(!!e.data.on)}",
    "});",
    "var __amInsOn=false;",
    "function __amHoverIn(ev){var t=ev.target;if(!t||!t.getBoundingClientRect)return;var cls=t.classList&&t.classList.length?t.classList[0]:'';if(cls==='__am-inspect-outline')cls=t.classList[1]||'';t.classList.add('__am-inspect-outline');var r=t.getBoundingClientRect();var cs=getComputedStyle(t);send({type:'inspect',tag:String(t.tagName||'').toLowerCase(),cls:cls,w:Math.round(r.width),h:Math.round(r.height),m:cs.margin,p:cs.padding})}",
    "function __amHoverOut(ev){if(ev.target&&ev.target.classList)ev.target.classList.remove('__am-inspect-outline')}",
    "function __amSetInspect(on){if(on===__amInsOn)return;__amInsOn=on;if(on){var st=document.createElement('style');st.id='__am-inspect-style';st.textContent='.__am-inspect-outline{outline:2px solid #8a63d2 !important;outline-offset:-1px}';document.head.appendChild(st);document.addEventListener('mouseover',__amHoverIn);document.addEventListener('mouseout',__amHoverOut)}else{var s=document.getElementById('__am-inspect-style');if(s)s.remove();document.removeEventListener('mouseover',__amHoverIn);document.removeEventListener('mouseout',__amHoverOut);var els=document.querySelectorAll('.__am-inspect-outline');for(var i=0;i<els.length;i++)els[i].classList.remove('__am-inspect-outline')}}",
    "})();",
  ].join("");
  return [
    "<!DOCTYPE html><html><head><meta charset=\"utf-8\">",
    "<meta http-equiv=\"Content-Security-Policy\" content=\"default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline' 'unsafe-eval'; img-src data:\">",
    "<style>", css, "</style></head><body>",
    html,
    "<script>", capture, "\n", js, "</scr" + "ipt>",
    "</body></html>",
  ].join("");
}
