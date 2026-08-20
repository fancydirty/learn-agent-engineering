# Video Source Intake

`yt-dlp` is an optional research helper for Agent Mentor course authors. Use it when a high-quality YouTube video contains material that is hard to get from static pages: talks, demos, walkthroughs, lectures, interviews, or expert explanations.

This helper is **not** part of the public-site runtime. It is an optional local source-acquisition adapter: if `yt-dlp` is available, the agent can extract metadata and captions without API keys; otherwise course generation continues with host search/browser tools or user-provided reliable links.

## When To Use It

Use video transcripts when:

- the video is official, from a known expert, or attached to a reputable course/conference;
- the transcript gives concrete demonstrations, examples, explanations, or historical context that written docs do not show well;
- the agent can cite the video URL, channel/uploader, upload date, caption type, language, and timestamps.

Do not rely on video transcripts alone when:

- the claim is a versioned API/framework behavior that should be checked against official docs;
- the video is marketing material without concrete evidence;
- captions are noisy enough that the meaning is uncertain;
- the course would need long copied transcript passages instead of short paraphrased, timestamped notes.

## Command

Bootstrap probe:

```bash
yt-dlp --version
```

Best-effort install policy:

- macOS with Homebrew: `brew install yt-dlp`
- Python user install: `python3 -m pip install --user -U yt-dlp`
- If pip reports an externally managed environment or permissions issue, do not use `sudo` and do not force system Python flags. Use `pipx install yt-dlp` when pipx is available, or ask the user to run the package-manager command that fits their machine.
- If an installed `yt-dlp` fails on YouTube extraction, update through the same installation channel. Release binaries can use `yt-dlp -U`; pip installs can rerun the pip install command.

From the skill repository root:

```bash
node scripts/video-source-intake.mjs "https://www.youtube.com/watch?v=<id>" --langs en,zh-Hans,zh
```

The helper writes to:

```text
agent-mentor/skills/generate-course-from-topic/runs/video-source-intake/<video-id>/
```

That directory is ignored by git. It contains:

- `source.json`: sanitized metadata, not the full `yt-dlp` info dump.
- `transcript.md`: timestamped local transcript cache.
- `source-snippet.md`: a draft `sources.md` block for the course author to adapt.
- the downloaded subtitle file, usually `.vtt`.

Useful options:

```bash
node scripts/video-source-intake.mjs <url> --source-index S4
node scripts/video-source-intake.mjs <url> --out /tmp/agentmentor-video-source
node scripts/video-source-intake.mjs <url> --json
```

## Authoring Rules

Video transcript sources belong in `sources.md`, not directly in lessons as long copied text. Convert them into course evidence like this:

```md
## S4 — Video title
- URL: <https://www.youtube.com/watch?v=...>
- authority: video-transcript (YouTube; channel: Official/Expert Channel; creator captions; lang: en)
- published: 2026-07-03
- transcript-cache: agent-mentor/skills/generate-course-from-topic/runs/video-source-intake/<id>/transcript.md
- supports: State which demonstration, analogy, historical context, or expert explanation in the course this backs.
- key-fact: Pick 1-3 short excerpts from the transcript cache with timestamps; do not copy the full transcript.
```

Rules:

- Prefer creator-provided captions over automatic captions. The helper does this automatically when both exist.
- Keep timestamps. A video source without timestamps is hard to audit.
- For technical facts, pair the transcript with official docs or another authoritative written source.
- Do not paste long transcript sections into lessons or `sources.md`.
- Do not download full video/audio as part of normal course generation.
- If `yt-dlp` fails because the video is private, age-gated, region-blocked, or rate-limited, do not work around it with user cookies unless the user explicitly provides and approves that path.

## Why This Fits The Universal Package

`yt-dlp` does not require Exa, Firecrawl, a private Worker, or a paid API key. The skill still works without it; video intake is just an optional local adapter. This keeps the package universal while letting capable agents mine YouTube for high-signal lectures and demos.
