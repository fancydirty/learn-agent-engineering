# Agent Learning Sources (source-pointer registry)

> Pointers, not knowledge. Knowledge goes stale; pointers get swapped. When a
> course topic is agent-related, the generation workflow reads this table first
> and prefers these vetted sources; web search becomes the supplement.
>
> Entry contract (machine-linted by `scripts/agent-sources-registry.mjs`):
> each entry is a `## An — Title` block with seven required fields —
> url / type (router-article|channel|video|official-doc) / audience / why /
> digest / vetted (YYYY-MM-DD) / access (open|login-required|may-need-proxy-in-cn).
> `access` states reality; it never bans a source. Reachability checks may skip
> what the current network cannot reach.
>
> Sourcing policy (2026-07-17): prefer crawlable, machine-auditable sources —
> GitHub repos (link health AND repo activity are checked monthly), official
> docs, and stable course pages. Social-media posts may seed the table but get
> replaced by open equivalents as soon as they exist.

## A1 — Jeff Su (YouTube channel)
- url: https://www.youtube.com/@JeffSu
- type: channel
- audience: Non-developers — office workers and students who want practical AI-at-work habits, no code assumed.
- why: 1.8M-subscriber workplace-productivity channel with a steady stream of plain-language agent and AI-tool walkthroughs; consistently current.
- digest: Pick one named video (see A2/A3 for vetted starters), pull the transcript with yt-dlp per docs/video-source-intake.md, and cross-check technical claims against official docs before citing.
- vetted: 2026-07-17
- access: may-need-proxy-in-cn — YouTube is unreachable from mainland China without a proxy; fall back to A4-A8 when blocked.

## A2 — AI Agents, Clearly Explained (video)
- url: https://www.youtube.com/watch?v=FwOTs4UxQS4
- type: video
- audience: Absolute beginners who want the agent concept explained in one sitting.
- why: The single best-scoped layperson explainer on the channel; defines what an agent is and is not without tooling detours.
- digest: Pull the auto-caption transcript with yt-dlp (verified available 2026-07-17); treat definitions as teaching framing and cross-check terminology against A4/A8.
- vetted: 2026-07-17
- access: may-need-proxy-in-cn — same YouTube reality as A1.

## A3 — The AI Agent Tutorial That Should've Been Your First (video)
- url: https://www.youtube.com/watch?v=GchXMRwuWxE
- type: video
- audience: Laypeople doing their first hands-on agent run; explicitly no-code.
- why: A first-run tutorial framed for people who have never delegated real work to an agent — a strong fit for the public site's beginner Agent audience.
- digest: Pull the auto-caption transcript with yt-dlp (verified available 2026-07-17); mine it for first-task framing and common beginner missteps, not for tool-specific UI steps that date quickly.
- vetted: 2026-07-17
- access: may-need-proxy-in-cn — same YouTube reality as A1.

## A4 — Anthropic Academy
- url: https://www.anthropic.com/learn
- type: official-doc
- audience: Everyone — the AI Fluency track targets non-developers; separate tracks cover Claude Code and API work.
- why: Official, free, certificate-bearing courses from the maker of Claude; the AI Fluency material is the canonical plain-language grounding.
- digest: Read course pages directly (text lessons); prefer AI Fluency pages for layperson courses and Claude Code track for tooling courses.
- vetted: 2026-07-17
- access: open

## A5 — OpenAI Academy: AI Foundations
- url: https://academy.openai.com/public/courses/ai-foundations-juzjs
- type: official-doc
- audience: People new to AI — practices giving clear instructions, adding context, and reviewing outputs.
- why: Official beginner course whose syllabus (clear instructions, reviewing outputs, responsible use) maps one-to-one onto this product's built-in course scope.
- digest: Course overview is readable without an account; full lessons need a free login — cite the syllabus framing, and have a logged-in human pull specifics when needed.
- vetted: 2026-07-17
- access: login-required — free account; the overview page is readable without one.

## A6 — OpenAI Academy: Agents and Workflows
- url: https://academy.openai.com/public/courses/agents-and-workflows-bieml
- type: official-doc
- audience: People already comfortable with AI chat who want to direct agents through structured work.
- why: Official course on providing context, defining outputs, setting boundaries, and reviewing agent drafts — the checking-agent-work half of our narrow course topic.
- digest: Same as A5 — overview open, lessons behind a free login; cite the syllabus structure and verify specifics against A8.
- vetted: 2026-07-17
- access: login-required — free account; the overview page is readable without one.

## A7 — microsoft/ai-agents-for-beginners (GitHub)
- url: https://github.com/microsoft/ai-agents-for-beginners
- type: router-article
- audience: Developer-leaning beginners; readable by ambitious non-developers, and the strongest fully-open structured curriculum.
- why: 18 structured lessons with text, code, and videos, maintained by Microsoft; serves as the open GitHub equivalent of the X "how to learn agents" router threads (which sit behind X login and are not independently verifiable).
- digest: Route through the README lesson table; read lesson markdown directly on GitHub; skip code sections for layperson courses.
- vetted: 2026-07-17
- access: open

## A8 — Building Effective AI Agents (Anthropic engineering essay)
- url: https://www.anthropic.com/engineering/building-effective-agents
- type: official-doc
- audience: Developers and advanced users; the authoritative reference for what agent patterns actually are.
- why: The canonical patterns essay (workflows vs agents, when not to use agents); the right cross-check anchor when lighter sources hand-wave.
- digest: Read directly (single long page); use it to fact-check terminology used in courses, not as beginner narrative.
- vetted: 2026-07-17
- access: open

## A9 — The 2026 Agent Engineering Roadmap (GitHub, agent-readable)
- url: https://github.com/codejunkie99/agent-roadmap-2026
- type: router-article
- audience: Developer-leaning readers who want the agent-engineering path specifically — harness design, context engineering, evals, production hardening; not for non-technical laypeople.
- why: The open home of a six-phase roadmap built almost entirely on primary sources (Anthropic and LangChain engineering posts), organized around the harness-over-model thesis; full content reviewed 2026-07-17. Originated as an X longread by Avid (AI-assisted writing disclosed), so treat it strictly as a router.
- digest: Fetch AGENT.md at the repo root — it is written for agents to consume and personalize; follow its links to the primary posts. Never cite its benchmark or salary numbers as facts.
- vetted: 2026-07-17
- access: open

## A10 — GenAI Agents: tutorials and implementations (GitHub)
- url: https://github.com/NirDiamant/GenAI_Agents
- type: router-article
- audience: Developer-leaning learners who want working, runnable agent tutorials from beginner to advanced; readable structure for ambitious non-developers.
- why: 23k-star, actively maintained (pushed within days of vetting) collection of 50+ agent tutorials with implementations; the crawlable, self-updating replacement for the retired X resource-thread seed.
- digest: Route through the README's tutorial index; read tutorial markdown directly on GitHub; skip code internals for layperson courses.
- vetted: 2026-07-17
- access: open

## A11 — Anthropic Interactive Prompt Engineering Tutorial (GitHub, official)
- url: https://github.com/anthropics/prompt-eng-interactive-tutorial
- type: official-doc
- audience: Anyone who wants structured practice writing clear instructions for a model; nine chapters with exercises, from basics up.
- why: Official Anthropic, 37k stars; the instruction-writing half of this product's built-in course topic, in hands-on form.
- digest: Read the chapter notebooks on GitHub directly (rendered by GitHub); exercises need an API key but the teaching text stands alone.
- vetted: 2026-07-17
- access: open
