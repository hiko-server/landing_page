# Changelog

All notable changes to this project will be documented in this file.

The format is loosely based on [Keep a Changelog](https://keepachangelog.com/),
and this project does not yet follow semver in earnest (single-deployment
portfolio CMS, no public package). Entries are grouped by release date.

## [Unreleased]

### publications

- **Publications (论文) in the CV**: a new CV Studio section for papers,
  preprints and theses — title, authors (ordered; add, remove and reorder
  by keyboard), venue and venue type, status (Published / In press /
  Accepted / Under review / Preprint, 已发表 / 印刷中 / 已录用 / 审稿中 /
  预印本), date (`YYYY` or `YYYY-MM`), volume, issue, pages, publisher,
  DOI, paper / PDF / code / slides links, abstract, keywords and award.
  Every field, paper and list item has the usual eye toggle and the CV /
  website switches. With linked languages, status, venue type, date,
  numbers, DOI and links are shared by EN and 中文 (text stays per
  language). Saving checks the status (required once a paper has a
  title), the DOI shape, the date shape and https-only links.
- **On the CV**: `/cv`, `/cv/zh`, the Reading view and the A4 sheet list
  the papers in citation style — the owner's name in bold (recognised from
  the public Personal Info in both languages, never hard-coded), venue in
  italics, a status label for anything not yet published, the DOI spelled
  out for paper, PDF / code / slides links and an abstract disclosure that
  is never printed. Published work first, then in press, accepted, under
  review and preprints, newest first. A paper under review never names
  its venue (APA 7). The renderers load on demand, so a CV without papers
  ships no extra JavaScript.
- **`/publications`**: every public paper with its anchor
  (`#<citation key>`), formatted citation, links, collapsible abstract and
  Copy BibTeX / Copy APA (plus copy-all), grouped by status, with year and
  status filters from six papers on; English chrome, Chinese entries
  marked `lang="zh-Hans"`. JSON-LD: a CollectionPage whose ItemList holds
  a ScholarlyArticle per paper (the site Person as author, DOI as
  identifier and `sameAs`, the journal / proceedings it is part of, a
  status, and no publication date for unpublished work). ISR, regenerated
  on every CV save, restore and import.
- **Nothing public without a paper**: until a public paper exists there is
  no CV section, no nav link (header, footer, drawer, ⌘K palette, the
  `/cv` header), no sitemap entry, and `/publications` answers 404. The
  page loaders ship the flag, so the link is in the server HTML (no
  request, no layout shift). Hidden fields, papers and authors never reach
  the HTML, `__NEXT_DATA__`, `/api/cvdata`, the JSON-LD or the sitemap.
- `lib/publications/` (pure): DOI normalisation, name matching, ordering,
  citation parts, BibTeX (entry type by venue type and status, escaped,
  case-protected, stable `lastnameYEARword` keys), APA 7, JSON-LD and JSON
  Resume `publications`, ready for the PDF CV, the exports and the home
  page.

## [2.3.0] — 2026-10-13

A research round across eight directions (UI, motion, reading, recruiter
value, admin, performance/SEO/accessibility, advanced features, security and
operations) with a live defect sweep of production, followed by the fixes
for every confirmed defect that needed no owner input, an adversarial review
of those fixes, and the move to Next.js 16.

### Fixed

- The home page no longer widens past the screen once its lazy sections
  mount (phones zoomed out to 1439 px); stat labels and accordion titles wrap
  instead of breaking or truncating.
- The hero only claims what is current: an ongoing role or study, otherwise
  no chip (it showed a job that ended in March); location and languages come
  from the CV in the CV's order. One Person entity on every page, with the
  real portrait.
- Real-user Web Vitals are recorded (none were before), and a CLS or INP that
  grows after a tab switch replaces the earlier value.
- Admin saves keep frontmatter fields the editors do not show (SEO title,
  updated date, language, cover alt); article images get their srcset once
  variants exist; footnotes stay out of the table of contents, are localised
  in Chinese articles, and highlighted code lines and file names render.
- Back/Forward run the directional page transition; open menus and dialogs no
  longer ghost over the next page; sections are visible in the first frame
  after a client navigation; printing shows every row.
- Keyboard: focus moves to the new page after navigation and is never hidden
  under the sticky header (WCAG 2.4.11), focusing the header or the CV action
  bar no longer scrolls the page, and single-key shortcuts can be switched off
  (WCAG 2.1.4).
- English chrome on Chinese pages is marked `lang="en"`; header glass and form
  errors meet contrast; light visitors no longer see a repaint; the mono
  fallback no longer shifts article metadata; dark-theme prints are readable,
  and only the CV page forces A4 without margins; head tags are unique.
- Operations: `/api/health` shows details only to the admin (or a
  `HEALTH_TOKEN`), and a malformed session cookie can no longer make admin
  routes answer 500; deploy backups keep the 10 newest; the IndexNow key is
  served from the site root; `/.well-known/security.txt` exists; `/colophon`
  and SECURITY.md describe the stack accurately.

### Platform

- Next.js 15.5.27 → 16.3.8 (Pages Router, React 18.3 unchanged: the Pages
  Router uses the React in package.json and Next 16 still accepts 18.2+).
  16.3.8 carries the same 2026-09-30 security fixes as 15.5.27 (SSG/ISR
  cache poisoning) and more; Next 15 leaves maintenance LTS on 2026-10-21.
- Builds stay on webpack: Next 16 defaults to Turbopack, so `yarn dev` /
  `yarn build` (and with them the Dockerfile and CI) run `next dev --webpack`
  / `next build --webpack`. `next build` no longer runs ESLint (CI lints
  separately, as before).
- Next 16 sets `"jsx": "react-jsx"` in tsconfig.json; the classic
  `import React from 'react'` lines that only served JSX are gone (76 files).
- Still on deprecated-but-supported Edge conventions, kept on purpose:
  `middleware.ts` (Next 16 calls it `proxy.ts`, which cannot run on the Edge
  runtime) and the Edge `/api/og` route. `next build` prints a deprecation
  notice for each.

### Removed

- The optional Sentry integration (`@sentry/nextjs` 8 does not support
  Next 16, and no DSN was ever configured): the `withSentryConfig` wrap, the
  `sentry.*.config.ts` files, the Sentry parts of `instrumentation.ts` (it
  still starts the backup schedule and adds `no-transform` to HTML), the API
  wrapper, the error boundary and `_error`, the `NEXT_PUBLIC_SENTRY_*` build
  args, the env docs and the Sentry hosts in the CSP `connect-src` (now
  `'self' https://api.github.com`). The standalone output no longer ships the
  SDK or OpenTelemetry (135 MB → 109 MB).
- Every audit allowlist entry: none is reported any more (Next 16 ships
  postcss 8.5; the Sentry build plugin was the only path to the others).

## [2.2.0] — 2026-10-13

A research-driven round (benchmarks of leading developer portfolios and CMS
admins, live visual/performance/accessibility/SEO audits) on a new platform:
Next.js 15.5 and patched dependencies.

### Security

- Next.js 14.2 → 15.5.27 (Pages Router, React 18): closes the image
  optimizer RCE/DoS, rewrite SSRF/smuggling and SSG/ISR cache-poisoning
  advisories. On-request image optimization is disabled (`/_next/image` →
  404); uploads are resized and converted at upload time instead.
- Tiptap 3.31.3, prosemirror-view 1.42.6, nodemailer 10.0.12, sharp 0.35.5
  and resolutions for vulnerable transitive packages; CI audit gate with a
  reviewed allowlist (build-time tooling only).
- MDX renders from a server-built tree without `eval`; the production CSP
  no longer allows `'unsafe-eval'`. Embeds are an allow-list (YouTube,
  Vimeo, figures).
- Every server-side fetch of a content- or admin-supplied URL goes through
  `lib/security/safeFetch` (public addresses only, DNS pinned, redirects
  re-checked, size and time limits).
- Uploaded and imported images lose their EXIF / XMP (GPS, camera serials)
  — losslessly when no resize or rotation is needed — and images that decode
  to more than 80 MP are refused with 413.
- Compiled articles and the feeds only carry safe link and image URLs
  (`javascript:` / `data:` are removed); embeds accept player URLs only.
- Signing out also ends Draft Mode, and the Draft bar's Exit works without a
  session.
- Analytics records article paths only for published slugs and gives each
  client and network a bounded share of the event budget.
- The tracked CV seed holds only public content; an old snapshot is no
  longer tracked.

### Added

- **Typography & motion**: real Geist Sans/Mono (two preloads, ~141 KB),
  balanced headings and tabular figures; circular theme reveal from the
  toggle; directional page transitions with a pinned header; blur-rise hero
  headline; cursor-lit card borders and hover-intent lists; scroll-driven
  experience rail; shared-element photo lightbox; number roll-ups. All
  transform/opacity only and off under reduced motion.
- **Home**: faster hero (pre-baked responsive WebP), Skills from the CV,
  writing & case-study links, full-width Field Notes, GitHub data rendered
  in the HTML, indigo contribution graph.
- **Command palette 3.0**: loads on demand, searches posts, case studies
  and CV entries, owner actions (inbox, backup, log out), vCard and booking.
- **Articles**: GFM tables/strikethrough, zero-CLS responsive images,
  refined reading layout, full-content `/feed.xml`, `/work/feed.xml`,
  `/feed.json`, Draft Mode with an Edit pill.
- **Pages**: `/cv/zh` as a real Chinese page (title, description, JSON-LD),
  per-entry CV anchors, contact availability card, vCard and QR, `/colophon`
  generated from the repository.
- **Authoring**: local drafts and conflict-safe saves for every editor,
  item history and undo-delete, compile-checked publishing with a checklist,
  side-by-side live preview, slash menu, upload-time WebP variants and safe
  remote image import.
- **Admin**: status hub with "Needs attention", Save and leave dialog,
  keyboard shortcuts overlay, sortable home cards, CV/home validation, and
  first-party cookieless **Analytics** with real-user Web Vitals.
- **Operations**: `scripts/deploy.sh` (bundle-based deploy with backups,
  health/warm-up gating, smoke test and automatic rollback), scheduled
  change-aware backups, structured JSON logs with request ids, Playwright +
  axe browser tests and a performance budget in CI.

### Changed

- Shared JavaScript 225 → 204 kB (`_app` 137 → 114 kB): palette, drawer and
  below-the-fold widgets load on demand; brand icons are inline SVG.
- `docker-compose.override.yml` is no longer tracked; copy
  `docker-compose.override.example.yml` on a new server.
- Lint runs through the ESLint CLI over the whole repository.
- Upload variants keep the original's extension (`photo.jpg.w640.webp`), so
  originals with the same stem never share variants.

### Fixed

- Lists, quotes and the slash menu's list items in the editor (a duplicate
  `prosemirror-model` broke wrapping and list splits).
- A post with an image inside a sentence no longer fails hydration; inline
  code wraps instead of being clipped on narrow screens.
- RSS publish times match the JSON Feed and structured data.
- Keyboard focus no longer dims the other rows of hover lists; the hero name
  appears at once under reduced motion; the lightbox allows pinch-zoom.
- The vCard no longer falls back to the built-in name when the owner hides
  the name fields.
- `scripts/deploy.sh`: a live analytics write during the backup no longer
  aborts the deploy, `--force` on the same commit recreates the container,
  and a dropped connection during the build restores the server.

## [2.1.0] — 2026-10-13

Hardening and polish on top of 2.0.0, after two adversarial reviews (81
confirmed findings fixed) and an end-to-end check against a copy of the live
content store.

### Added

- **Admin Inbox** (`/admin/dashboard?tab=inbox`, Alt/⌃+5): every contact
  message is stored with whether it was emailed — readable and answerable
  (reply-by-email with the original quoted) even when SMTP is not
  configured. Read/unread, delete, unread badge, keyboard navigation.
  Site-wide daily and size caps; full-site backups include it and restores
  merge it without bringing deleted messages back.
- **CV Studio**: hidden-items panel (every hidden section/entry/field/bullet
  in EN and 中, jump-to and one-click Show), A4 CV / Website preview,
  alignment badges for linked EN↔中 lists, drafts that remember the version
  they were based on.
- **Admin-only reads with optimistic concurrency**: `GET /api/admin/cvdata`
  and `/api/admin/home` return the full documents with a version ETag;
  saves send `If-Match` and get 409 instead of silently overwriting newer
  edits. Public `GET /api/cvdata` / `/api/home` always return the pruned
  view, even to a signed-in admin.
- **Mobile CV reading mode** with a sticky Download PDF / EN·中文 / Copy link
  bar; **self-updating /now and /uses** built from the public CV, the
  currently-coding note, the latest writing and the curated stack.
- **Articles**: heading anchors, sticky table of contents, reading progress,
  prev/next and related items; **command palette 2.0** (fuzzy ranking,
  recents, in-page jumps, CV / theme / link actions).
- **On-demand revalidation**: saving a post, case study, page, CV or home
  page refreshes the affected static pages immediately; a boot-time warm-up
  (`scripts/warm-isr.mjs`) replaces the image's build-time pages before
  traffic arrives.
- Persistent header/footer across navigation, native view transitions,
  real PWA icons, AA-contrast accent tokens.

### Fixed

- `next build` failed with "database is locked" when the store did not exist
  yet (always the case in the Docker build).
- Next's `res.json()` replaced version ETags with a body hash, so every
  conditional save conflicted (`lib/http.ts` `sendVersionedJson`).
- Editors could load the pruned public CV after a session expired and save
  it back, deleting hidden content.
- A full-backup restore was undone on the next boot; public pages kept
  reading the old database after a restore; failed R2 writes could be
  reverted by the boot sync (`r2_pending` now repairs them).
- Hidden end dates showed as "Present", hidden expiry dates as "No Expiry";
  linked hide toggles could hit the wrong 中 entry; "Sync 中 ← EN" dropped
  中-only hides; duplicating a hidden entry made it public.
- Home page layout shift on phones (CLS 0.28–0.48 → none); light-mode dark
  flash; portals without the site fonts; `/cv` language not following client
  navigation; social cards blocked by robots.txt.

### Security

- Middleware refuses cross-site and non-JSON writes to admin/content APIs.
- Login: per-(email, IP) lockout plus a real site-wide throughput cap under
  attack, a signed known-device cookie for the owner, identical responses
  for unknown e-mail vs wrong password, async scrypt.
- Logout and password reset revoke every issued session.
- Client-IP headers trusted only from loopback and the container's default
  gateway unless `TRUSTED_PROXY_IPS` is set.
- Contact form: the sum is issued and verified by the server (HMAC bound to
  the single-use nonce); JSON-LD escaped against script breakout; one
  upload-name rule for upload, serving and backups.

## [2.0.0] — 2026-10-12

### Added

- **CV visibility at every level.** Hide / show any section (separately
  for the CV/PDF and for the website), any entry (degree, job, project,
  highlight, certificate…), any field (e.g. Education → GPA, phone,
  email) and any single bullet or tag. Hidden content is removed
  server-side from `/`, `/about`, `/cv` and the unauthenticated
  `GET /api/cvdata` (`lib/cvVisibility.ts`, `readPublicCvData()`).
- **CV Studio rewrite** (`components/Admin/CVEditorStudio.tsx`,
  `components/Admin/cvStudio/*`): schema-driven forms for every section
  (`lib/cvSections.ts`), per-field eye toggles, collapsible entry cards
  with drag-and-drop / duplicate / delete-with-undo, bullet editor
  (Enter = new bullet, Backspace on empty = remove, Alt+↑/↓ = move,
  multi-line paste), tag input, month pickers with "Present", one undo
  history for EN + 中 with typing coalesced per field, EN ↔ 中 linked
  visibility & structure, in-editor "Sync 中 ← EN" (undoable), local
  draft recovery, overwrite guard when the CV changed elsewhere, live
  fit-to-width A4 preview with page-break guides, responsive panes.
- **Patents** and **Languages** sections now render on the A4 CV and on
  `/about` (patents data existed but was never shown).
- `/cv?lang=zh` and `/cv?print=1`; language-aware dates (`Sep 2024` /
  `2024.09`), labels (`至今`, `预计`, `电话`, `邮箱`) and Chinese name order.
- Curated, grouped tech stack (`/api/stack`) instead of a raw dependency
  dump; copy button on MDX code blocks; real `G`-then-key navigation
  shortcuts in the command palette.

### Fixed

- Studio wrote Awards to `competitionAwardsList` and Extra Skills to
  `extraSkills` (the viewer reads `awards` / `points`), so those edits
  never appeared; missing editors for highlights, related skills,
  certificate details and patents.
- Header: menu missing on phones for 7 routes and on all tablets; sticky
  header never stuck; links did full page reloads; Dashboard / Logout
  never appeared (httpOnly cookie read from JS); the "last commit" pill
  wrapped onto three lines beside the full nav.
- Affiliation logos overflowed the page horizontally on tablets (fixed
  160px chips in a 4-column grid).
- Dashboard mounted every editor at once — the Studio's ⌘S/⌘Z fired on
  other tabs and editors overwrote each other's saves.
- Image uploads over ~750 KB failed (1 MB body limit); same-name uploads
  overwrote each other; PNG logos lost transparency.
- Home editor could wipe the home page if its load failed; upload
  callbacks reverted edits made during the upload.
- Raw JSON editor rewrote every curly quote in CV text on save.
- Version restore didn't snapshot the current state first; snapshot times
  were shown in the wrong timezone.
- Backup restore hung on a corrupt archive; non-atomic DB swap; local
  snapshot path check could be bypassed.
- MongoDB backup/restore used stale seed files instead of the live store
  (restores silently changed nothing); image restore allowed path
  traversal; connection string returned to the browser and cached in
  localStorage.
- MDX frontmatter dates crashed static generation; deleted posts could be
  resurrected from disk seeds or a stale R2 copy.
- Floating section nav targeted IDs that didn't exist; hero typewriter
  leaked timers; a `marginTop: 320px` hack triggered by any URL containing
  "edit"; About hero hook-order bug; syntax highlighting colours never
  applied.
- Blog/work editors: tags couldn't contain commas/spaces while typing,
  fields editable before load, "New" could overwrite an existing slug.

### Security

- Login lockout is now per (account, client IP) with a global breaker,
  so a stranger can no longer lock the admin out; failures against a
  wrong email no longer count. Admin email compared case-insensitively.
- One shared admin-auth helper with the JWT algorithm pinned (HS256).
- Rate limits keyed per route + IP (one endpoint can't exhaust another's
  budget), bounded memory, optional `TRUSTED_PROXY_IPS`.
- Contact nonces audience-scoped; contact form returns an error when a
  message could be neither mailed nor stored; mailer no longer logs
  bodies (reset links); SMTP timeouts.
- Reset-password validates token / password before consuming the token.
- Uploads: AVIF brand check, never overwrite, served with a sandboxing
  CSP; CSP drops unused hCaptcha / Binance hosts; production browser
  source maps disabled.

### Changed

- Docker: named volumes for `/app/data` and `/app/public/uploads` (admin
  password changes, history, backups and uploads now survive redeploys);
  `NEXT_PUBLIC_*` passed as build args; runtime state excluded from the
  build context. CI on Node 22. Boot-time R2 sync keeps newer local edits.
- GitHub proxies: fetch timeouts, shared in-flight requests, short
  failure caching, CDN cache headers; stats hide instead of showing zeros.
- Accessibility: skip link + `<main>` landmark, one `h1` per page,
  labelled icon buttons, accessible carousel (pause / play, keyboard,
  captions as alt text), combobox semantics in the command palette,
  `prefers-reduced-motion` honoured by every animation, AA contrast fixes.
- Removed 38 unused dependencies (MUI, FontAwesome, Formik, axios,
  next-auth, i18n stack, styled-components, luxon, …) and ~40 dead files;
  lint is at zero warnings.

## [Earlier]

### Security

- **CRITICAL** — `/admin/*` and `/api/admin/*` are now gated by
  edge middleware (`jose`-backed JWT verify) before any page renders.
  Previously `/admin/{dashboard,db-config,now,uses}` rendered the UI
  shell to unauthenticated visitors.
- Per-account login lockout (10 fails / 15 min → 15 min lock) layered
  on the existing per-IP rate limit. Defeats IP rotation.
- Constant-time scrypt compare on equal-length buffers; replaced the
  hand-rolled XOR that early-returned on length mismatch.
- Username-enumeration defence: scrypt always runs even when the email
  is unknown.
- Same-origin check on `POST /api/auth/email-login` in production.
- Admin responses now carry `X-Robots-Tag: noindex,nofollow,noarchive`
  and `Cache-Control: no-store`.
- Bumped `axios` to `>=1.15.2` (SSRF / credential-injection) and
  force-resolved `i18next-fs-backend` to `>=2.6.4` (path traversal).

### Added

- **Whole-site tarball snapshots** — `lib/backup.ts` packs SQLite (via
  the Online Backup API, WAL-consistent), uploaded images, version-
  history snapshot dirs, and admin/Mongo config into one gzipped tar.
  Manual *Backup now* and *Pull latest* buttons in the Storage admin
  panel; local copies under `data/backups/`, R2 pushes to
  `backups/<UTC>.tgz` plus `backups/latest.tgz`.
- **Per-section visibility** — every `[NN]` home row is toggleable
  from the Home editor (`introduction`, `brands`, `open-source`,
  `tech-stack`, `activity`, `projects`, `experience`,
  `certifications`, `photos`, `contact`).
- **Editable contact panel** — eyebrow, heading, blurb, and reasons
  dropdown all sourced from `home.json`; built-in defaults when blank.
- **"Currently coding" chip auto-fill** — `label / project / note`
  follows `admin > CV-auto > blank` per line. Auto-derivation in
  `lib/currentlyCoding.ts`: most-relevant current job + earliest
  start year.
- `lib/homeShape.ts` — pure types/helpers split out of `lib/home.ts`
  so the client bundle doesn't try to import `better-sqlite3`.
- Bilingual industry-grade `README.md` + `README.zh.md` with
  architecture diagrams, env table, route inventory, screenshots.
- `docs/screenshots/` scaffold + reusable
  `scripts/_take-screenshots.mjs` (puppeteer-core driver).
- `SECURITY.md`, `CONTRIBUTING.md`, `CHANGELOG.md`,
  `.github/ISSUE_TEMPLATE/{bug,feature}.md`,
  `.github/PULL_REQUEST_TEMPLATE.md`, `.github/dependabot.yml`.

### Changed

- Admin nav button hidden when logged out. Reach `/admin/login` via the
  ⌘K command palette or by typing the URL directly.
- `SectionReveal` defaults to `width: 100%` — fixes the /about
  Contributions accordion width jitter on click + language toggle.
- Repo URLs flipped to `hiko-server/landing_page` (CommandPalette
  "View source", README clone instructions, security disclosure link,
  `package.json` `repository` / `bugs` / `homepage` fields).
- CI workflow: `npm ci` → `yarn install --frozen-lockfile`. Adds
  type-check + concurrency cancel + a soft-fail audit job.

### Removed

- ~99k lines / 282 files of dead code unrelated to the portfolio:
  `services/` (old axios + auth client), `pages/demo/` (route-planning
  sample), `styles/scss_files/` (vendored Bootstrap 5 + unused SCSS),
  `example/` (placeholder JSON), `api/` (old REST wrappers),
  `components/{Panels,RoutesRelated}/`,
  `components/General-UI/Landing_Navbar.tsx`, six `layout/*.tsx` files
  used only by the demo, six `helpers/*.ts(x)` files (all 0
  consumers), three `types/*Props.ts` files (0 consumers),
  `context/cvDataState.tsx`, `styles/globals.scss` + `loadingScreen.module.css`.
- Tel/email click-to-reveal block from intro `[01]` (contact lives on
  `/contact` + home `[09]`).
- `data/admin.json` no longer tracked in git — bootstraps from
  `ADMIN_EMAIL`/`ADMIN_PASS` on first boot.

### Fixed

- `Module not found: fs` build crash caused by client-bundled
  components importing values (not just types) from the SQLite-backed
  `lib/home.ts`. Resolved via the `homeShape.ts` split.
- Stale "Use env ADMIN_EMAIL/ADMIN_PASS" hint on the login page.

## Earlier

For commit-level history prior to this changelog, see
`git log --oneline` on `main`. The repo's existing convention is one
feature-session per commit with a `feat:` / `fix:` prefix.
