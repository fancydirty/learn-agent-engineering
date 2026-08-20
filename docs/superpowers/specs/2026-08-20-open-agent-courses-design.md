# Agent Mentor Open Courses Design

## Purpose

Build an independent, open-source acquisition site for current Agent topics. The site teaches a useful subject completely, demonstrates the quality of Agent Mentor course output, lets readers copy material into their own Agent, and hands qualified readers to `agentmentor.dev` through attributed links.

The repository, deployment, content license, release cadence, analytics, and runtime are independent from the paid Agent Mentor product. The only runtime connection is an outbound HTTPS link to `https://agentmentor.dev`.

## Fixed Decisions

- Workspace and Git repository: `/Users/dirtyfancy/projects/agent-mentor-open-courses`.
- Public origin: `https://learn.agentmentor.dev`.
- Runtime: Next.js App Router deployed to Cloudflare Workers with `@opennextjs/cloudflare`.
- Rendering: static generation for the home, course, lesson, glossary, and sources pages.
- Storage: checked-in course files. No database, KV, D1, R2, account data, or runtime content generation.
- Code license: MIT.
- Course content license: CC BY 4.0.
- Languages: each course declares one language; the initial course is Chinese. Language expansion requires a separately reviewed course, not automatic bulk translation.

## Product Boundary

### Included

- A restrained course-library home page.
- Stable course, lesson, glossary, and sources URLs.
- Markdown, tables, code blocks, diagrams, footnotes, and static exercises.
- Course navigation, table of contents, breadcrumbs, previous/next lesson navigation, and source attribution.
- Copy-code buttons.
- A full-lesson “copy to Agent” action.
- A selection action that turns highlighted text into a self-contained Agent prompt and copies it.
- A single contextual Agent Mentor CTA with course-level UTM attribution.
- `robots.txt`, `sitemap.xml`, canonical metadata, Open Graph metadata, and JSON-LD.

### Excluded

- Payments, checkout, top-up, balance, account console, orders, and webhooks.
- Authentication, license keys, entitlement checks, BYOK, or secrets.
- Ask AI, online search, hosted model calls, live appendices, or AI-generated responses.
- Review, spaced repetition, dynamic quiz generation, learning progress, notes, or learner memory.
- Podcast generation, podcast player, MP3, VTT, TTS, or audio storage.
- Buyer publishing, capability tokens, public-site rotation, lease renewal, or `/s/<token>` routes.
- Product install, workflow, refund, privacy, terms, and internal-gallery pages. The course site links to the product site instead of duplicating them.
- Runtime course authoring, maintenance, export, or publication APIs.

## Course Admission Rule

Every indexed course must satisfy all of these conditions:

1. Agent is the primary subject, not a decorative angle added to a generic AI topic.
2. The topic has at least two current demand signals, including one primary signal such as an official release, specification, documentation update, or maintained reference implementation.
3. The course contains original value: a tested workflow, an artifact, a comparison, an executable template, or a failure analysis.
4. Factual claims link to primary sources, and freshness-sensitive claims include a review date.
5. The reader can complete a useful task without buying Agent Mentor.
6. The paid CTA is a natural next step for readers who want to produce or maintain courses themselves.

Generic programming, office productivity, image generation, and broad AI news are not valid standalone courses. Evergreen material may appear only as supporting context inside a current Agent course.

## Content Contract

Each course lives under `content/courses/<course-slug>/` and contains:

- `course.json`: title, description, language, status, evidence signals, review date, tags, and ordered lessons.
- `README.md`: course overview and learning outcomes.
- `lessons/<lesson-slug>.md`: lesson body with a single H1 and static exercises.
- `glossary.json`: terms used by the course.
- `sources.md`: primary-source bibliography.

The loader rejects a course unless it is published, Agent-related, has two evidence signals, has a valid review date, has at least one lesson, and every declared file exists.

## Routes

- `/`: editorial facade and published course list.
- `/courses/<course>`: overview and lesson list.
- `/courses/<course>/<lesson>`: complete lesson with copy actions.
- `/courses/<course>/glossary`: glossary.
- `/courses/<course>/sources`: sources.
- `/robots.txt` and `/sitemap.xml`: discovery controls.

Unknown course and lesson slugs return a real 404.

## Conversion and Measurement

Every Agent Mentor link uses:

- `utm_source=learn`
- `utm_medium=course`
- `utm_campaign=<course-slug>`
- `utm_content=<placement>`

The primary outcome is attributed install or purchase activity. Search impressions, clicks, course entries, copy actions, and CTA clicks are diagnostic or leading signals, not final success.

## Visual Direction

The site is an editorial technical notebook, not a SaaS dashboard. It uses a warm paper background, dark ink, one orange accent, compact typography, wide reading measure, visible source dates, and restrained interaction. There are no pricing cards, account chrome, dashboard panels, fake social proof, or animated product theater.

## Deployment and Security

- OpenNext output runs in Cloudflare `workerd` with `nodejs_compat`.
- Production configuration names `learn.agentmentor.dev` as a Worker custom domain.
- Deployment credentials live only in GitHub Actions secrets.
- The broad setup token is never committed. A narrower Workers Scripts Write token is preferred for steady-state CI.
- The deployed bundle must not contain payment, entitlement, live-AI, review, podcast, or token-publishing route strings.

## Verification

Completion requires:

- Unit tests for course admission, URL construction, prompt construction, and metadata inputs.
- Render tests for the home, course, lesson, glossary, sources, and copy controls.
- Boundary tests proving forbidden routes and dependencies do not exist.
- A successful Next.js production build.
- A successful OpenNext build.
- A successful local preview in Cloudflare `workerd` with HTTP checks for HTML, canonical metadata, robots, sitemap, and real 404s.

