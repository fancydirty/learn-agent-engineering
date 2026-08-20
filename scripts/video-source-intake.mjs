#!/usr/bin/env node
// Optional YouTube transcript intake helper for course authors.
// It shells out to yt-dlp, extracts metadata plus subtitles, and leaves a
// course-ready source snippet without making yt-dlp a reader/runtime dependency.
import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { basename, dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
export const DEFAULT_LANGUAGES = ["en", "en-US", "en-GB", "zh-Hans", "zh-CN", "zh", "zh-TW"];
export const DEFAULT_OUT_ROOT = join(
  ROOT,
  "agent-mentor",
  "skills",
  "generate-course-from-topic",
  "runs",
  "video-source-intake",
);

const SUBTITLE_EXTENSIONS = [".vtt", ".srt", ".ttml", ".srv3", ".json3"];
const VALUE_OPTIONS = new Set(["--url", "--langs", "--lang", "--out", "--source-index"]);

function readArg(argv, name) {
  const index = argv.indexOf(name);
  if (index === -1) return null;
  return argv[index + 1] || "";
}

function splitList(value) {
  return String(value || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

export function parseArgs(argv = process.argv.slice(2)) {
  const positional = [];
  for (let index = 0; index < argv.length; index += 1) {
    const item = argv[index];
    if (VALUE_OPTIONS.has(item)) {
      index += 1;
      continue;
    }
    if (!item.startsWith("-")) positional.push(item);
  }
  const url = readArg(argv, "--url") || positional[0] || "";
  const langs = readArg(argv, "--langs") || readArg(argv, "--lang");
  const out = readArg(argv, "--out");
  const sourceIndex = readArg(argv, "--source-index") || "S?";

  return {
    url,
    languages: splitList(langs).length > 0 ? splitList(langs) : DEFAULT_LANGUAGES,
    outDir: out ? resolve(out) : null,
    sourceIndex,
    json: argv.includes("--json"),
    help: argv.includes("--help") || argv.includes("-h"),
  };
}

export function runYtDlp(args, options = {}) {
  return spawnSync("yt-dlp", args, {
    cwd: ROOT,
    encoding: "utf8",
    maxBuffer: 100 * 1024 * 1024,
    ...options,
  });
}

export function probeYtDlp(runner = runYtDlp) {
  const result = runner(["--version"]);
  return {
    ok: result.status === 0,
    version: (result.stdout || "").trim(),
    error: result.stderr || result.error?.message || "",
  };
}

export function fetchVideoInfo(url, runner = runYtDlp) {
  const result = runner(["--dump-json", "--skip-download", "--no-playlist", "--no-warnings", url]);
  if (result.status !== 0) {
    throw new Error(`yt-dlp metadata failed: ${(result.stderr || result.stdout || "").trim()}`);
  }
  try {
    return JSON.parse(result.stdout);
  } catch (error) {
    throw new Error(`yt-dlp metadata was not valid JSON: ${error.message}`);
  }
}

function langMatches(candidate, preferred) {
  if (candidate === preferred) return true;
  if (candidate.toLowerCase() === preferred.toLowerCase()) return true;
  const base = preferred.toLowerCase().split("-")[0];
  return candidate.toLowerCase() === base || candidate.toLowerCase().startsWith(`${base}-`);
}

function pickFromTracks(tracks = {}, languages = DEFAULT_LANGUAGES) {
  const entries = Object.entries(tracks).filter(([, formats]) => Array.isArray(formats) && formats.length > 0);
  for (const preferred of languages) {
    const exact = entries.find(([lang]) => langMatches(lang, preferred));
    if (exact) return { lang: exact[0], formats: exact[1] };
  }
  return null;
}

export function pickSubtitleTrack(info, languages = DEFAULT_LANGUAGES) {
  const manual = pickFromTracks(info?.subtitles, languages);
  if (manual) return { ...manual, kind: "manual" };
  const automatic = pickFromTracks(info?.automatic_captions, languages);
  if (automatic) return { ...automatic, kind: "automatic" };
  return null;
}

function outputDirFor(info, outDir) {
  if (outDir) return outDir;
  const id = info?.id || "unknown-video";
  return join(DEFAULT_OUT_ROOT, id.replace(/[^a-zA-Z0-9_-]/g, "_"));
}

function findSubtitleFile(outDir, info, subtitle) {
  const files = readdirSync(outDir);
  const idPrefix = `${info.id}.`;
  const candidates = files
    .filter((file) => file.startsWith(idPrefix))
    .filter((file) => SUBTITLE_EXTENSIONS.some((ext) => file.endsWith(ext)))
    .sort((a, b) => {
      const aLang = a.includes(`.${subtitle.lang}.`) ? 0 : 1;
      const bLang = b.includes(`.${subtitle.lang}.`) ? 0 : 1;
      return aLang - bLang || a.localeCompare(b);
    });
  return candidates[0] ? join(outDir, candidates[0]) : null;
}

export function downloadSubtitle(url, info, subtitle, outDir, runner = runYtDlp) {
  mkdirSync(outDir, { recursive: true });
  const flag = subtitle.kind === "manual" ? "--write-subs" : "--write-auto-subs";
  const result = runner([
    "--skip-download",
    flag,
    "--sub-langs",
    subtitle.lang,
    "--sub-format",
    "vtt/srt/best",
    "--no-playlist",
    "--no-warnings",
    "--paths",
    outDir,
    "--output",
    "%(id)s.%(ext)s",
    url,
  ]);
  if (result.status !== 0) {
    throw new Error(`yt-dlp subtitle download failed: ${(result.stderr || result.stdout || "").trim()}`);
  }
  const subtitleFile = findSubtitleFile(outDir, info, subtitle);
  if (!subtitleFile) {
    throw new Error(`yt-dlp did not write a subtitle file in ${outDir}`);
  }
  return subtitleFile;
}

function decodeEntities(text) {
  return text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, "\"")
    .replace(/&#39;/g, "'");
}

function cleanCaptionLine(line) {
  return decodeEntities(line)
    .replace(/<[^>]+>/g, "")
    .replace(/\{\\.*?\}/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeTimestamp(value) {
  const raw = value.replace(",", ".").trim();
  const parts = raw.split(":");
  if (parts.length === 2) return `00:${parts[0]}:${parts[1].split(".")[0]}`;
  return `${parts[0].padStart(2, "0")}:${parts[1]}:${parts[2].split(".")[0]}`;
}

export function parseSubtitleTranscript(text) {
  const normalized = String(text || "").replace(/\r\n?/g, "\n");
  const blocks = normalized.split(/\n{2,}/);
  const cues = [];
  for (const block of blocks) {
    const lines = block
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);
    if (lines.length === 0) continue;
    if (/^(WEBVTT|Kind:|Language:|NOTE\b)/i.test(lines[0])) continue;

    const timingIndex = lines.findIndex((line) => /-->\s*/.test(line));
    if (timingIndex === -1) continue;
    const timing = lines[timingIndex];
    const start = timing.split("-->")[0]?.trim();
    const captionText = lines
      .slice(timingIndex + 1)
      .map(cleanCaptionLine)
      .filter(Boolean)
      .join(" ");
    if (!start || !captionText) continue;
    const previous = cues[cues.length - 1];
    if (previous?.text === captionText) continue;
    cues.push({ time: normalizeTimestamp(start), text: captionText });
  }
  return cues;
}

function formatDate(value) {
  const raw = String(value || "");
  if (/^\d{8}$/.test(raw)) return `${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6, 8)}`;
  return raw || "unknown";
}

function formatDuration(seconds) {
  const n = Number(seconds);
  if (!Number.isFinite(n) || n <= 0) return "unknown";
  const h = Math.floor(n / 3600);
  const m = Math.floor((n % 3600) / 60);
  const s = Math.floor(n % 60);
  return h > 0
    ? `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`
    : `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export function sanitizeVideoInfo(info) {
  return {
    id: info.id || "",
    title: info.title || "",
    uploader: info.uploader || info.channel || "",
    channel: info.channel || "",
    uploadDate: formatDate(info.upload_date),
    duration: formatDuration(info.duration),
    webpageUrl: info.webpage_url || info.original_url || "",
    description: info.description || "",
  };
}

export function formatTranscriptMarkdown(info, subtitle, cues) {
  const safe = sanitizeVideoInfo(info);
  const captionKind = subtitle.kind === "manual" ? "creator-provided" : "auto-generated";
  return [
    `# ${safe.title || safe.id}`,
    "",
    `- URL: ${safe.webpageUrl}`,
    `- Channel: ${safe.uploader || safe.channel || "unknown"}`,
    `- Upload date: ${safe.uploadDate}`,
    `- Duration: ${safe.duration}`,
    `- Captions: ${captionKind}, ${subtitle.lang}`,
    "",
    "> Generated by scripts/video-source-intake.mjs. Treat this as a local research cache; only copy short, relevant, timestamped excerpts into course sources.",
    "",
    ...cues.map((cue) => `- [${cue.time}] ${cue.text}`),
    "",
  ].join("\n");
}

export function formatSourceSnippet(info, subtitle, transcriptPath, sourceIndex = "S?") {
  const safe = sanitizeVideoInfo(info);
  const captionLabel = subtitle.kind === "manual" ? "creator captions" : "auto captions";
  const relTranscript = relative(ROOT, transcriptPath);
  const displayTranscript = relTranscript.startsWith("..") ? transcriptPath : relTranscript;
  return [
    `## ${sourceIndex} — ${safe.title || safe.id}`,
    `- URL: <${safe.webpageUrl}>`,
    `- authority: video-transcript (YouTube; channel: ${safe.uploader || safe.channel || "unknown"}; ${captionLabel}; lang: ${subtitle.lang})`,
    `- publish-date: ${safe.uploadDate}`,
    `- transcript-cache: ${displayTranscript}`,
    "- support: the course author should pick short excerpts and timestamps from the transcript cache and cross-check version/API/factual claims against other authoritative sources.",
    "- key-excerpts: pick 1-3 short excerpts with timestamps from the transcript cache; do not copy the entire transcript verbatim.",
    "",
  ].join("\n");
}

function availableCaptionLanguages(info) {
  const manual = Object.keys(info?.subtitles || {});
  const automatic = Object.keys(info?.automatic_captions || {});
  return {
    manual,
    automatic,
  };
}

export function writeIntakeFiles(info, subtitle, subtitleFile, outDir, sourceIndex = "S?") {
  const cues = parseSubtitleTranscript(readFileSync(subtitleFile, "utf8"));
  if (cues.length === 0) {
    throw new Error(`No timed caption cues could be parsed from ${basename(subtitleFile)}`);
  }
  const metadataPath = join(outDir, "source.json");
  const transcriptPath = join(outDir, "transcript.md");
  const snippetPath = join(outDir, "source-snippet.md");
  writeFileSync(metadataPath, JSON.stringify({
    ...sanitizeVideoInfo(info),
    subtitle: {
      kind: subtitle.kind,
      lang: subtitle.lang,
      file: basename(subtitleFile),
    },
  }, null, 2));
  writeFileSync(transcriptPath, formatTranscriptMarkdown(info, subtitle, cues));
  writeFileSync(snippetPath, formatSourceSnippet(info, subtitle, transcriptPath, sourceIndex));
  return { cues, metadataPath, transcriptPath, snippetPath };
}

export function intakeVideoSource(url, options = {}, deps = {}) {
  if (!url) throw new Error("Missing YouTube/video URL.");
  const runner = deps.runner || runYtDlp;
  const probe = probeYtDlp(runner);
  if (!probe.ok) {
    throw new Error(`yt-dlp is not available. Install it first, then rerun this helper. ${probe.error}`.trim());
  }
  const info = fetchVideoInfo(url, runner);
  const subtitle = pickSubtitleTrack(info, options.languages || DEFAULT_LANGUAGES);
  if (!subtitle) {
    const available = availableCaptionLanguages(info);
    throw new Error(
      `No captions found for requested languages (${(options.languages || DEFAULT_LANGUAGES).join(", ")}). ` +
      `Manual: ${available.manual.join(", ") || "none"}. Auto: ${available.automatic.join(", ") || "none"}.`,
    );
  }
  const outDir = outputDirFor(info, options.outDir);
  mkdirSync(outDir, { recursive: true });
  const subtitleFile = downloadSubtitle(url, info, subtitle, outDir, runner);
  const files = writeIntakeFiles(info, subtitle, subtitleFile, outDir, options.sourceIndex || "S?");
  return {
    ok: true,
    ytDlpVersion: probe.version,
    info: sanitizeVideoInfo(info),
    subtitle,
    outDir,
    subtitleFile,
    ...files,
  };
}

function usage() {
  return `Usage:
  node scripts/video-source-intake.mjs <youtube-url> [--langs en,zh-Hans,zh] [--out path] [--source-index S3] [--json]

Purpose:
  Extract metadata and captions with yt-dlp for course source research.
  Defaults write to agent-mentor/skills/generate-course-from-topic/runs/video-source-intake/<video-id>/.
`;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = parseArgs();
  if (args.help) {
    console.log(usage());
    process.exit(0);
  }
  try {
    const result = intakeVideoSource(args.url, args);
    if (args.json) {
      console.log(JSON.stringify({
        ok: true,
        ytDlpVersion: result.ytDlpVersion,
        outDir: result.outDir,
        transcriptPath: result.transcriptPath,
        snippetPath: result.snippetPath,
        captionKind: result.subtitle.kind,
        captionLang: result.subtitle.lang,
        cueCount: result.cues.length,
      }, null, 2));
    } else {
      console.log(`OK video source intake`);
      console.log(`yt-dlp: ${result.ytDlpVersion}`);
      console.log(`caption: ${result.subtitle.kind} ${result.subtitle.lang}`);
      console.log(`transcript: ${result.transcriptPath}`);
      console.log(`source snippet: ${result.snippetPath}`);
      console.log("");
      console.log(readFileSync(result.snippetPath, "utf8"));
    }
  } catch (error) {
    console.error(`FAIL video source intake: ${error.message}`);
    process.exit(1);
  }
}
