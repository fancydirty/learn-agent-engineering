"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { css } from "@codemirror/lang-css";
import { html } from "@codemirror/lang-html";
import { javascript } from "@codemirror/lang-javascript";
import type { ReactCodeMirrorProps } from "@uiw/react-codemirror";
import { buildSrcdoc, type LiveBlock, type LiveFiles } from "@/lib/live-sandbox";
import type { Lang } from "@/lib/i18n";
import { siteCopy } from "@/lib/site-copy";
import {
  appendCapped,
  changedLineNumbers,
  solutionChangedKeys,
  type FileKey,
} from "@/lib/live-sandbox-ui";
import { loadSavedLive, saveLive, loadSavedStats } from "@/lib/live-storage";
import { changedLinesExtension } from "@/lib/codemirror-changed-lines";
import { bumpStat, emptyStats, markEdit, statsSummaryLines, type LiveStats } from "@/lib/live-stats";
import { decodeShare } from "@/lib/live-share";
import { InteractiveCardShell } from "./interactive-card-shell";
import { RollLabel } from "@/components/motion/roll-label";
import { useIsDark } from "@/lib/use-is-dark";
import { useIsCoarse } from "@/lib/use-is-coarse";
import { darkEditorExtensions } from "@/lib/codemirror-theme";

function CodeMirrorLoading() {
  return <div className="code-exercise-loading" aria-hidden="true" />;
}

const CodeMirror = dynamic<ReactCodeMirrorProps>(
  () => import("@uiw/react-codemirror").then((mod) => mod.default),
  {
    ssr: false,
    loading: CodeMirrorLoading,
  },
);

interface ConsoleMessage {
  level: "log" | "warn" | "error";
  msg: string;
  timestamp: number;
}

const PREVIEW_MIN = 160;
const PREVIEW_MAX = 480;
const TAB_LABEL: Record<FileKey, string> = { html: "HTML", css: "CSS", js: "JS" };

export function LiveSandboxBlock({ block, lang }: { block: LiveBlock; lang: Lang }) {
  const t = siteCopy[lang].blocks.sandbox;
  const common = siteCopy[lang].blocks.common;
  const copyT = siteCopy[lang].reader.copy;
  // instance id from block.id for SSR/hydration consistency
  const instanceId = `am-live-${block.id}`;
  const storageKey = `am-live:${typeof window !== "undefined" ? window.location.pathname : ""}:${block.id}`;
  const answerModeRef = useRef(false);
  const restoredRef = useRef(false);
  const [previewWidth, setPreviewWidth] = useState<number | null>(null); // null = 100%

  const [currentFiles, setCurrentFiles] = useState<LiveFiles>(block.files);
  const [activeTab, setActiveTab] = useState<FileKey>(() => {
    if (block.files.html.trim()) return "html";
    if (block.files.css.trim()) return "css";
    return "js";
  });
  const [srcdoc, setSrcdoc] = useState(() => buildSrcdoc(block.files, { instanceId, checks: block.checks }));
  const [consoleMessages, setConsoleMessages] = useState<ConsoleMessage[]>([]);
  const [consoleExpanded, setConsoleExpanded] = useState(false);
  const [copyState, setCopyState] = useState<"idle" | "done" | "fail">("idle");
  const [isFocused, setIsFocused] = useState(false);
  const [running, setRunning] = useState(false);
  const [previewHeight, setPreviewHeight] = useState(PREVIEW_MIN + 40);
  const [overlayMsg, setOverlayMsg] = useState<string | null>(null);
  // answer reference
  const [answerMode, setAnswerMode] = useState(false);
  const [compareSrcdoc, setCompareSrcdoc] = useState<string | null>(null);
  const [changedTabs, setChangedTabs] = useState<FileKey[]>([]);
  const [changedLines, setChangedLines] = useState<Partial<Record<FileKey, number[]>>>({});
  const [toast, setToast] = useState<string | null>(null);
  const userFilesRef = useRef<LiveFiles | null>(null);
  // snapshot after applying answer — detect edits on top of solution
  const answerFilesRef = useRef<LiveFiles | null>(null);
  // filesRef mirror for handlers — keep setState updaters pure (StrictMode double-invoke)
  const filesRef = useRef<LiveFiles>(block.files);
  const statsRef = useRef<LiveStats>(emptyStats());
  const [inspectOn, setInspectOn] = useState(false);
  const [inspectInfo, setInspectInfo] = useState<string | null>(null);
  const [replInput, setReplInput] = useState("");
  const [checksPass, setChecksPass] = useState<boolean | null>(null);
  const achievedShownRef = useRef(false);
  const hasChecks = (block.checks?.length ?? 0) > 0;

  const isDark = useIsDark();
  const isCoarse = useIsCoarse();
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);
  const iframeKeyRef = useRef(0);
  const iframeRef = useRef<HTMLIFrameElement | null>(null);

  const availableTabs = useMemo((): FileKey[] => {
    const tabs: FileKey[] = [];
    if (block.files.html.trim()) tabs.push("html");
    if (block.files.css.trim()) tabs.push("css");
    if (block.files.js.trim()) tabs.push("js");
    return tabs;
  }, [block.files]);

  const hasSolution = useMemo(() => Object.keys(block.solution).length > 0, [block.solution]);
  const hasJs = block.files.js.trim().length > 0;
  const errorCount = useMemo(
    () => consoleMessages.filter((m) => m.level === "error").length,
    [consoleMessages],
  );
  const isDirty = useMemo(
    () =>
      answerMode ||
      currentFiles.html !== block.files.html ||
      currentFiles.css !== block.files.css ||
      currentFiles.js !== block.files.js,
    [answerMode, currentFiles, block.files],
  );

  const extensions = useMemo(() => {
    const langExt =
      activeTab === "html" ? [html()] : activeTab === "css" ? [css()] : [javascript()];
    const marks = changedLines[activeTab];
    return [
      ...langExt,
      ...(marks && marks.length ? [changedLinesExtension(marks)] : []),
      ...(isDark ? darkEditorExtensions : []),
    ];
  }, [activeTab, isDark, changedLines]);

  useEffect(() => {
    const handleMessage = (e: MessageEvent) => {
      if (e.data?.__amLive !== true) return;
      if (e.data.id !== instanceId) return; // 多块同页防串台
      if (iframeRef.current && e.source !== iframeRef.current.contentWindow) return;
      if (e.data.type === "height" && typeof e.data.h === "number") {
        setPreviewHeight(Math.min(PREVIEW_MAX, Math.max(PREVIEW_MIN, Math.ceil(e.data.h))));
        return;
      }
      if (e.data.type === "inspect") {
        setInspectInfo(
          `${e.data.tag}${e.data.cls ? "." + e.data.cls : ""} · ${e.data.w}×${e.data.h} · m:${e.data.m} · p:${e.data.p}`,
        );
        return;
      }
      if (e.data.type === "checks") {
        const pass = e.data.pass === true;
        setChecksPass(pass);
        if (pass && !achievedShownRef.current && !answerModeRef.current) {
          achievedShownRef.current = true;
          setToast(t.toastAchieved);
          if (statsRef.current.achievedTs === null) {
            statsRef.current = { ...statsRef.current, achievedTs: Date.now() };
            saveLive(window.localStorage, storageKey, filesRef.current, statsRef.current);
          }
        }
        return;
      }
      const { level, msg } = e.data;
      if (level && msg) {
        setConsoleMessages((prev) =>
          appendCapped(prev, { level, msg: String(msg), timestamp: Date.now() }),
        );
        if (level === "error") {
          setConsoleExpanded(true);
          setOverlayMsg((prev) => prev ?? String(msg));
        }
      }
    };
    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [instanceId]);

  // on mount: share hash beats local save; stats from save (client only)
  useEffect(() => {
    if (restoredRef.current) return;
    restoredRef.current = true;
    const savedStats = loadSavedStats(window.localStorage, storageKey);
    if (savedStats) statsRef.current = savedStats;
    void (async () => {
      const shared = await decodeShare(window.location.hash);
      if (shared && shared.id === block.id) {
        filesRef.current = shared.files;
        setCurrentFiles(shared.files);
        rebuild(shared.files);
        setToast(t.toastLoadedShared);
        window.history.replaceState(null, "", window.location.pathname + window.location.search);
        return;
      }
      const saved = loadSavedLive(window.localStorage, storageKey);
      if (!saved) return;
      if (saved.html === block.files.html && saved.css === block.files.css && saved.js === block.files.js) return;
      filesRef.current = saved;
      setCurrentFiles(saved);
      rebuild(saved);
      setToast(t.toastRestoredAttempt);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    return () => {
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    };
  }, []);

  // toast auto-dismiss
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 6000);
    return () => clearTimeout(timer);
  }, [toast]);

  const rebuild = useCallback(
    (files: LiveFiles) => {
      setConsoleMessages([]);
      setOverlayMsg(null);
      setChecksPass(null);
      setRunning(false);
      iframeKeyRef.current += 1;
      setSrcdoc(buildSrcdoc(files, { instanceId, checks: block.checks }));
    },
    [instanceId],
  );

  const updateCode = (key: FileKey, value: string) => {
    setToast(null);
    const next = { ...filesRef.current, [key]: value };
    filesRef.current = next;
    setCurrentFiles(next);
    setRunning(true);
    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    debounceTimerRef.current = setTimeout(() => {
      rebuild(next);
      statsRef.current = markEdit(statsRef.current, Date.now());
      if (!answerModeRef.current) saveLive(window.localStorage, storageKey, next, statsRef.current);
    }, 300);
  };

  const sendCmd = (cmd: Record<string, unknown>) => {
    iframeRef.current?.contentWindow?.postMessage(cmd, "*");
  };

  const toggleInspect = () => {
    const next = !inspectOn;
    setInspectOn(next);
    if (!next) setInspectInfo(null);
    sendCmd({ __amLiveCmd: "inspect", on: next });
  };

  const applyChoice = (code: string) => {
    if (!block.choices) return;
    setToast(null);
    const next = { ...filesRef.current, [block.choices.target]: code };
    filesRef.current = next;
    setCurrentFiles(next);
    setActiveTab(block.choices.target);
    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    rebuild(next);
    if (!answerModeRef.current) saveLive(window.localStorage, storageKey, next, statsRef.current);
  };

  const applySolution = () => {
    const prev = filesRef.current;
    userFilesRef.current = prev;
    setCompareSrcdoc(buildSrcdoc(prev, { instanceId: `${instanceId}:mine` }));
    const keys = solutionChangedKeys(prev, block.solution);
    const next = { ...prev };
    const lines: Partial<Record<FileKey, number[]>> = {};
    for (const k of keys) {
      next[k] = block.solution[k]!;
      lines[k] = changedLineNumbers(prev[k], next[k]);
    }
    filesRef.current = next;
    answerFilesRef.current = next;
    setCurrentFiles(next);
    setChangedTabs(keys);
    setChangedLines(lines);
    setAnswerMode(true);
    answerModeRef.current = true;
    statsRef.current = bumpStat(statsRef.current, "solutionViews");
    if (keys.length) {
      setActiveTab(keys[0]);
      setToast(t.toastAppliedSolution(keys.map((k) => TAB_LABEL[k])));
    } else {
      setToast(t.toastSolutionMatches);
    }
    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    rebuild(next);
  };

  const restoreMine = () => {
    const mine = userFilesRef.current;
    if (!mine) return;
    // user edited after answer applied → warn before restore
    const answer = answerFilesRef.current;
    const editedOnAnswer =
      answer !== null &&
      (filesRef.current.html !== answer.html ||
        filesRef.current.css !== answer.css ||
        filesRef.current.js !== answer.js);
    answerFilesRef.current = null;
    setAnswerMode(false);
    setCompareSrcdoc(null);
    answerModeRef.current = false;
    setChangedTabs([]);
    setChangedLines({});
    setToast(editedOnAnswer ? t.toastRestoredBeforeAnswer : null);
    filesRef.current = mine;
    setCurrentFiles(mine);
    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    rebuild(mine);
  };

  const reset = () => {
    userFilesRef.current = null;
    answerFilesRef.current = null;
    setAnswerMode(false);
    setCompareSrcdoc(null);
    answerModeRef.current = false;
    setChangedTabs([]);
    setChangedLines({});
    setToast(null);
    filesRef.current = block.files;
    setCurrentFiles(block.files);
    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    rebuild(block.files);
    statsRef.current = bumpStat(statsRef.current, "resets");
    saveLive(window.localStorage, storageKey, block.files, statsRef.current);
  };

  const copy = async () => {
    try {
      const summary = statsSummaryLines(statsRef.current, currentFiles, block.solution, hasChecks, lang);
      const text = [
        block.copyPurpose,
        ...(summary.length ? ["", ...summary] : []),
        "",
        t.currentCodeLabel,
        "HTML:",
        currentFiles.html || t.emptyFile,
        "",
        "CSS:",
        currentFiles.css || t.emptyFile,
        "",
        "JS:",
        currentFiles.js || t.emptyFile,
      ].join("\n");
      await navigator.clipboard.writeText(text);
      setCopyState("done");
    } catch {
      setCopyState("fail");
    }
    window.setTimeout(() => setCopyState("idle"), 1600);
  };

  const achieved = hasChecks && checksPass === true;
  const statusState = running ? "running" : errorCount > 0 ? "error" : achieved ? "achieved" : "ok";
  const statusText = running
    ? t.statusRunning
    : errorCount > 0
      ? t.statusErrors(errorCount)
      : achieved
        ? `🎯 ${t.statusAchieved}`
        : t.statusOk;
  const latestMsg = consoleMessages[consoleMessages.length - 1];

  const mainStage = (
    <div
      className="live-viewport-stage"
      style={previewWidth ? { width: previewWidth } : undefined}
    >
      <iframe
        key={iframeKeyRef.current}
        ref={iframeRef}
        title={t.preview}
        sandbox="allow-scripts"
        srcDoc={srcdoc}
        onLoad={() => {
          if (inspectOn) sendCmd({ __amLiveCmd: "inspect", on: true });
        }}
      />
    </div>
  );

  return (
    <InteractiveCardShell eyebrow={block.label} title={block.goal} anchorId={instanceId}>
      <div className="live-sandbox-container">
        <div className="live-sandbox-toolbar">
          <span className="live-sandbox-status" data-state={statusState}>
            <i aria-hidden="true" />
            {statusText}
          </span>
          <div className="live-sandbox-toolbar-actions">
            <button type="button" onClick={reset} disabled={!isDirty}>
              ↺ {common.reset}
            </button>
            {hasSolution && (
              <button
                type="button"
                className={answerMode ? "is-answer-mode" : ""}
                onClick={answerMode ? restoreMine : applySolution}
              >
                {answerMode ? `⇄ ${t.restoreMine}` : t.showAnswer}
              </button>
            )}
            <button type="button" onClick={copy}>
              <RollLabel state={copyState} idle={common.copyToAgent} done={copyT.copied} fail={copyT.failed} />
            </button>
          </div>
        </div>

        {block.choices && (
          <div className="live-sandbox-choices">
            {block.choices.intro && <span className="live-choices-intro">{block.choices.intro}</span>}
            {block.choices.items.map((it) => (
              <button
                key={it.label}
                type="button"
                className={currentFiles[block.choices!.target] === it.code ? "is-active" : ""}
                onClick={() => applyChoice(it.code)}
              >
                {it.label}
              </button>
            ))}
          </div>
        )}

        <div className="live-sandbox-frame">
          <div className="live-sandbox-layout">
            <div className="live-sandbox-editor-pane">
              <div className="live-sandbox-tabs" role="tablist">
                {availableTabs.map((tab) => (
                  <button
                    key={tab}
                    type="button"
                    role="tab"
                    aria-selected={activeTab === tab}
                    aria-controls={`live-editor-${block.id}-${tab}`}
                    onClick={() => setActiveTab(tab)}
                    className={activeTab === tab ? "is-active" : ""}
                  >
                    {TAB_LABEL[tab]}
                    {changedTabs.includes(tab) && (
                      <span className="live-tab-change" aria-label={t.tabChangedAria} />
                    )}
                  </button>
                ))}
              </div>
              <div
                id={`live-editor-${block.id}-${activeTab}`}
                role="tabpanel"
                className={isFocused ? "live-sandbox-editor is-focused" : "live-sandbox-editor"}
                data-language={activeTab}
              >
                <CodeMirror
                  value={currentFiles[activeTab]}
                  theme={isDark ? "none" : "light"}
                  editable={!isCoarse}
                  readOnly={isCoarse}
                  extensions={extensions}
                  basicSetup={{
                    lineNumbers: true,
                    foldGutter: false,
                    highlightActiveLine: true,
                  }}
                  onChange={(value) => updateCode(activeTab, value)}
                  onFocus={() => setIsFocused(true)}
                  onBlur={() => setIsFocused(false)}
                  aria-label={t.editorAria(TAB_LABEL[activeTab])}
                />
              </div>
            </div>

            <div className="live-sandbox-preview-pane">
              <div className="live-sandbox-preview-label">
                <span>{t.preview}</span>
                <span className="live-viewport-presets">
                  <button
                    type="button"
                    className={inspectOn ? "is-active" : ""}
                    onClick={toggleInspect}
                  >
                    {t.inspect}
                  </button>
                  {!isCoarse &&
                    [375, 768, null].map((w) => (
                      <button
                        key={String(w)}
                        type="button"
                        className={previewWidth === w ? "is-active" : ""}
                        onClick={() => setPreviewWidth(w)}
                      >
                        {w ? w : "100%"}
                      </button>
                    ))}
                </span>
              </div>
              {inspectOn && inspectInfo && (
                <div className="live-inspect-info">{inspectInfo}</div>
              )}
              <div
                className={compareSrcdoc ? "live-sandbox-preview-frame is-compare" : "live-sandbox-preview-frame"}
                style={{ height: previewHeight }}
              >
                {overlayMsg && (
                  <div className="live-error-overlay" role="alert">
                    <span>{overlayMsg}</span>
                    <button type="button" aria-label={t.closeErrorAria} onClick={() => setOverlayMsg(null)}>
                      ×
                    </button>
                  </div>
                )}
                {compareSrcdoc && (
                  <div className="live-compare-pane" data-label={t.mine}>
                    <div
                      className="live-viewport-stage"
                      style={previewWidth ? { width: previewWidth } : undefined}
                    >
                      <iframe title={t.myCodePreviewTitle} sandbox="allow-scripts" srcDoc={compareSrcdoc} />
                    </div>
                  </div>
                )}
                {compareSrcdoc ? (
                  <div className="live-compare-pane" data-label={t.answer}>
                    {mainStage}
                  </div>
                ) : (
                  mainStage
                )}
              </div>
            </div>
          </div>

          {hasJs && (
            <div className="live-sandbox-console">
              <button
                type="button"
                className="live-sandbox-console-header"
                onClick={() => setConsoleExpanded((prev) => !prev)}
                aria-expanded={consoleExpanded}
              >
                <span className="live-console-summary">
                  {t.console} {consoleMessages.length > 0 && `(${consoleMessages.length})`}
                  {!consoleExpanded && latestMsg && (
                    <span className={`live-console-latest level-${latestMsg.level}`}>
                      {latestMsg.msg}
                    </span>
                  )}
                </span>
                <span aria-hidden="true">{consoleExpanded ? "▼" : "▶"}</span>
              </button>
              {consoleExpanded && (
                <div className="live-sandbox-console-body" aria-live="polite">
                  {consoleMessages.length === 0 ? (
                    <div className="live-sandbox-console-empty">{t.noMessages}</div>
                  ) : (
                    <>
                      <div className="live-console-actions">
                        <button type="button" onClick={() => setConsoleMessages([])}>
                          {t.clear}
                        </button>
                      </div>
                      <ul>
                        {consoleMessages.map((msg, idx) => (
                          <li key={idx} className={`live-console-message level-${msg.level}`}>
                            <span className="live-console-level">[{msg.level}]</span>
                            <span className="live-console-text">{msg.msg}</span>
                          </li>
                        ))}
                      </ul>
                    </>
                  )}
                  <form
                    className="live-repl"
                    onSubmit={(e) => {
                      e.preventDefault();
                      const code = replInput.trim();
                      if (!code) return;
                      setConsoleMessages((prev) =>
                        appendCapped(prev, { level: "log", msg: `> ${code}`, timestamp: Date.now() }),
                      );
                      sendCmd({ __amLiveCmd: "eval", code });
                      setReplInput("");
                    }}
                  >
                    <input
                      value={replInput}
                      onChange={(e) => setReplInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Escape") setReplInput("");
                      }}
                      placeholder={t.replPlaceholder}
                      aria-label={t.replAria}
                    />
                  </form>
                </div>
              )}
            </div>
          )}
        </div>

        {toast && <div className="live-sandbox-toast">{toast}</div>}
      </div>
    </InteractiveCardShell>
  );
}
