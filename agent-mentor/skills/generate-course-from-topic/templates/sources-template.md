# Sources

<!--
Format contract for sources.md (guard checkCitations / checkSourcesAuthority and the reader both parse it this way):

- Each source is a `## Sn — Title` block (n increments from 1: S1, S2, ...) — not a Markdown footnote.
- Lesson body text cites a source with `[^Sn]`; the reader links `[^Sn]` to the matching `## Sn` block here.
- Do NOT write `[^Sn]: definition` footnote-definition lines in sources.md or in lessons — that's the wrong
  format and makes guard treat every citation as dangling (the reader generates footnotes from `## Sn` blocks,
  not from `[^Sn]:` definitions).
- Each block has four lines: title (`##` line), `URL:`, `- authority: <value>`, `- supports:` one sentence on
  what point in the course it backs, `- key-fact:` the excerpt.
- `authority:` uses a plain colon; see the value list below. At least one key fact must be backed by a
  non-`ai-generated` source.
Replace the two example blocks below with your real sources, then delete this comment.
-->

## S1 — Source title (e.g., official docs page name / book chapter)
URL: https://example.com/authoritative-page
- authority: official-docs
- supports: One sentence explaining which key fact in the course this source backs.
- key-fact: The exact quote or data point excerpted from the source that made it into the lesson body.

## S2 — Second source title
URL: https://example.com/second-source
- authority: authoritative-guide
- supports: What point in the course it backs.
- key-fact: The excerpt.

<!--
`authority:` value (pick one, required):
  official-docs       vendor / standards body / API docs
  authoritative-guide reputable author / publisher / course
  video-transcript    auditable captions of official/expert/course/conference video (must carry channel, date, caption type, language, timestamp)
  encyclopedia        Wikipedia etc. — editable but with provenance
  blog                personal / small site — usable with judgment
  ai-generated        marketing copy with unbacked "studies show / 2026 new practice" claims, AI-generated wikis — RED FLAG, cannot be the sole source of a key fact
-->
