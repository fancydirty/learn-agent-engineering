# SEO / Analytics — learn.agentmentor.dev

Current state (configured 2026-08-30):

## Google Analytics 4
- Property: **Learn Agent Mentor** (GA4 property `552080514`)
- Measurement ID: `G-XRQ947KFS7`
- Wired via `components/analytics.tsx`, rendered in `app/[locale]/layout.tsx` when
  `NEXT_PUBLIC_GA_ID` is set (see `.env.example`; the real value lives in `.env.local`,
  which is gitignored and read at build time — deploys must run from a machine that has it).
- Realtime reporting verified end-to-end after deploy.

## Google Search Console
- Domain property `sc-domain:agentmentor.dev` (DNS-verified) covers this subdomain —
  no per-site meta verification tag needed. `NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION`
  exists as an optional escape hatch and is currently unset.
- Sitemap `https://learn.agentmentor.dev/sitemap.xml` submitted and accepted ("成功").

## On-page SEO
- Per-page canonical + hreflang (6 locales + x-default): `lib/seo.ts`
  (`localizedAlternates` / `libraryAlternates`), used by the course/lesson/glossary/
  sources/courses pages. Site-wide defaults (OG image, twitter card, robots,
  keywords, GSC verification) come from `defaultMetadata` in the same file.
- Structured data: `Organization` + `WebSite` JSON-LD in `components/structured-data.tsx`,
  rendered from the locale layout.
- OG image: `public/og-image.png` (1200×630).
- `public/robots.txt` allows all crawlers and points at the sitemap.
- `app/sitemap.ts` generates entries for every locale/course/lesson/glossary/sources page.

## Indexing campaign (started 2026-09-15)

GSC 页面索引状态（2026-09-15）：150 已收录 / 692 未收录，其中 673 为
"已发现 - 尚未编入索引"（新站正常，等待抓取）；16 个 404 均为主域
agentmentor.dev 的旧课程 URL，与本站无关，Google 会自然清出。

手动收录请求（每日配额约 10-12 条）：
- 2026-09-15 已请求 11 页：/en/courses、/zh/courses、全部 12 门课的 en
  目录页中的 9 门（agent-observability、agent-verification、
  agent-state-persistence 因配额顺延）。
- 后续批次脚本：`~/.claude/scripts/gsc-learn-agentmentor/gsc-queue.sh`
  （基于 ego-browser 自动化 GSC 网址检查 → 请求编入索引，触到配额自动停）。
- 策略：只手动请求课程库页 + 课程目录页（枢纽页）；440+ 课时页靠枢纽页
  内链和 sitemap 让 Google 自行发现，无需逐页请求。

## Bing / IndexNow (2026-09-15)

- IndexNow key 文件：`public/f3705a770ce94ece9aa3974eb3c8b332.txt`。
- 已把 sitemap 全部 654 个 URL 提交至 api.indexnow.org（HTTP 200，覆盖
  Bing/Yandex/Naver/Seznam）。内容更新部署后跑 `scripts/indexnow-submit.sh`
  重新推送即可。
- Bing Webmaster Tools 已开通（Microsoft 账号经 Google fancydirty@gmail.com 登录）：
  - `learn.agentmentor.dev` 已添加并通过 XML 文件验证
    （`public/BingSiteAuth.xml` + `msvalidate.01` meta 双保险，都在 repo 里），
    sitemap 已提交。报告数据约 48 小时后出现。
  - 主域 `agentmentor.dev` 的 sitemap（27 URL）也已代为提交，"无 sitemap"警告即将消除。
  - 主域剩余建议（inbound links 不足、旧页面标题/描述过短）属于主站仓库与外链建设，
    与本仓库无关；旧课程页已 404，相关警告会随重抓自然消失。

## Monitoring checklist
- GSC → 编制索引/站点地图: watch for crawl errors after content changes.
- GA4 realtime + acquisition reports: https://analytics.google.com/analytics/web/#/p552080514
- Structured data spot-check: https://search.google.com/test/rich-results
