# Course Reader Scope Matrix

Source reviewed: `/Users/dirtyfancy/projects/agent-mentor/agent-mentor-skill/course-reader` on 2026-08-20.

This is a whitelist migration. Components are reimplemented in this repository against checked-in public course files; there is no package, symlink, submodule, runtime fetch, or import from the paid repository.

| Existing capability | Decision | Open-courses treatment |
|---|---|---|
| Course library and course cards | Rewrite | One editorial home listing only admitted, published Agent courses. |
| Course overview | Keep/rewrite | Static `/courses/<slug>` page from checked-in content. |
| Lesson reader | Keep/rewrite | Static lesson HTML with source links and copy actions. |
| Course navigation and breadcrumbs | Keep/rewrite | Small server components with stable public URLs. |
| Markdown, GFM tables, code, math | Keep/rewrite | Minimal renderer; no product-specific fenced-block runtime. |
| Mermaid diagrams | Keep/rewrite | Client-only renderer for explicit `mermaid` fences. |
| Code-block copy | Keep/rewrite | Clipboard-only client component. |
| Whole-lesson copy | Keep/rewrite | Self-contained Agent prompt plus original lesson Markdown. |
| Selection action | Keep/rewrite | One “复制给 Agent” chip; no live Ask branch. |
| Glossary | Keep/rewrite | Static term list and anchors. |
| Sources and footnotes | Keep/rewrite | Static bibliography and source links. |
| Static exercises | Keep | Rendered as course Markdown; no scoring or persistence. |
| Share links | Keep/rewrite | Canonical public URLs only. |
| Product CTA | Rewrite | External attributed link to `agentmentor.dev`; no local buy page. |
| Public showcase sitemap | Rewrite | Includes every admitted course, lesson, glossary, and sources URL. |
| Ask dock / Ask AI / live drawer | Delete | No model calls or AI response UI. |
| Live sandbox / live appendix / distill | Delete | No live execution or saved generated content. |
| Review page / review API / FSRS | Delete | No review or scheduling state. |
| Dynamic quiz generation | Delete | Only static exercise text remains. |
| Progress tracking / notes / memory | Delete | No learner state or write API. |
| Podcast player / TTS / MP3 / VTT | Delete | No audio code, files, routes, metadata, or dependencies. |
| Balance / top-up / console | Delete | No account or credits UI. |
| Buy / checkout / Paddle / Alipay | Delete | Product purchase stays on `agentmentor.dev`. |
| Entitlements / license / BYOK | Delete | Public course pages are anonymous and complete. |
| Buyer publish `/s/<token>` | Delete | No capability tokens or hosted buyer sites. |
| Publish lease / rotation / R2 bundle | Delete | Git commit and Worker deploy are the only publication mechanism. |
| Install / workflow / refund / legal product pages | Delete | Link to product site; do not duplicate product documentation. |
| Blog and generic tag archive | Delete | The course library itself is the acquisition surface. |
| Internal interaction gallery | Delete | No internal/demo routes in the public repository. |
| Poster generation | Delete | Social assets are build artifacts outside the reader runtime. |

## Forbidden Route and Dependency Vocabulary

Boundary tests scan production source and build routes for:

`topup`, `balance`, `console`, `checkout`, `paddle`, `alipay`, `entitlement`, `license`, `ask-ai`, `live/ask`, `review`, `podcast`, `tts`, `/s/[token]`, `pub-site`, and `publish-lease`.

The word “review” remains allowed only in editorial metadata such as `reviewedAt`; the route `/review` and learning-review implementation are forbidden.

