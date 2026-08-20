# Course Reader Scope Matrix

Source reviewed: `/Users/dirtyfancy/projects/agent-mentor/agent-mentor-skill/course-reader` on 2026-08-20.

This is a whitelist migration. The original reader and course-generation skill were copied into this independent repository, then product-only surfaces were pruned in place. There is no package, symlink, submodule, runtime fetch, or import from the paid repository.

| Existing capability | Decision | Open-courses treatment |
|---|---|---|
| Course library and course cards | Keep/adapt | Original card surface, narrowed to admitted Agent courses. |
| Course overview | Keep/adapt | Static `/<slug>` page from checked-in content. |
| Lesson reader | Keep/adapt | Original lesson reader with product-only branches removed. |
| Course navigation and breadcrumbs | Keep/adapt | Original navigation with stable public URLs and course-language chrome. |
| Markdown, GFM tables, code, math | Keep | Original renderer and fenced-block support. |
| Mermaid diagrams | Keep | Original client renderer for explicit `mermaid` fences. |
| Code-block copy | Keep | Original clipboard interaction. |
| Whole-lesson copy | Keep/adapt | Self-contained Agent prompt plus original lesson Markdown. |
| Selection action | Keep/adapt | Original selection affordance narrowed to “复制给 Agent”; no live Ask branch. |
| Glossary | Keep/adapt | Static term list, hover definitions, and anchors. |
| Sources and footnotes | Keep | Static bibliography and source links. |
| Deterministic exercises | Keep | Local feedback and copy-to-Agent actions; no persistent score. |
| Share links | Keep/adapt | Canonical public URLs only. |
| Product CTA | Adapt | External attributed link to `agentmentor.dev`; no local buy page. |
| Public sitemap | Adapt | Includes every admitted course, lesson, glossary, and sources URL. |
| Ask dock / Ask AI / live drawer | Delete | No model calls or AI response UI. |
| Local sandbox | Keep | Deterministic in-browser iframe execution only; no model, server write, or account state. |
| Live appendix / distill | Delete | No generated answers or saved generated content. |
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
