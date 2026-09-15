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

## Monitoring checklist
- GSC → 编制索引/站点地图: watch for crawl errors after content changes.
- GA4 realtime + acquisition reports: https://analytics.google.com/analytics/web/#/p552080514
- Structured data spot-check: https://search.google.com/test/rich-results
