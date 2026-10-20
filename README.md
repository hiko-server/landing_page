<div align="center">

# Portfolio Studio

**A self-hostable, content-driven personal site + admin studio.**
Local-first SQLite, off-site Cloudflare R2 mirror, MDX writing, MongoDB
backup, and a hardened admin GUI for non-engineers.

中文版 → [README.zh.md](./README.zh.md)

[![Repo](https://img.shields.io/badge/GitHub-hiko--server%2Flanding__page-181717?logo=github)](https://github.com/hiko-server/landing_page)
[![Next.js](https://img.shields.io/badge/Next.js-15.5-black?logo=next.js)](https://nextjs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-blue?logo=typescript)](https://www.typescriptlang.org/)
[![Chakra UI](https://img.shields.io/badge/Chakra_UI-2.8-319795?logo=chakraui)](https://chakra-ui.com/)
[![SQLite](https://img.shields.io/badge/Storage-SQLite-003B57?logo=sqlite)](https://www.sqlite.org/)
[![Cloudflare R2](https://img.shields.io/badge/Mirror-R2-f38020?logo=cloudflare)](https://developers.cloudflare.com/r2/)
[![Docker](https://img.shields.io/badge/Docker-Ready-2496ED?logo=docker)](https://www.docker.com/)
[![License](https://img.shields.io/badge/License-MIT-yellow)](LICENSE)

<img src="docs/screenshots/hero-light.png" alt="Home page in light mode" width="900" />

</div>

---

## Highlights

- **Local-first content store** — SQLite at `data/content.db` is canonical;
  Cloudflare R2 is an off-site mirror; the filesystem MDX/JSON is a one-way
  seed. Every admin write is a synchronous DB write + best-effort R2 push.
- **One-click whole-site snapshots** — tarball backup pipeline packs the
  SQLite DB (via the SQLite Online Backup API, WAL-consistent), uploaded
  images, version-history snapshots, and admin/Mongo config into one
  gzipped tar. Manual *Backup now* / *Pull latest* buttons in the admin.
- **MDX writing layer** — `/blog`, `/work` (case studies), `/now`, `/uses`
  pages backed by typed MDX collections, compiled on the server (no `eval`
  in the browser), with brand-font social cards and full-content feeds.
- **Bilingual CV** — English at `/cv`, Chinese at `/cv/zh` (the legacy
  `/cv?lang=zh` answers 308), `?print=1`, language-aware dates and labels,
  A4 print/PDF with real per-page margins, rolling version history.
  Downloadable as a server-rendered, tagged PDF (`/cv.pdf`, `/cv/zh.pdf`),
  plain text (`/cv.txt`) and JSON Resume (`/cv.json`), with skill evidence
  and GitHub / LinkedIn / case-study links.
- **CV Studio with visibility at every level** — hide/show any *section*
  (separately for the CV/PDF and the website), any *entry* (a degree, a
  job, a highlight), any *field* (GPA, phone, …) and any single *bullet or
  tag* with an eye toggle. Hidden content is stripped server-side from
  every public page and the public API, not just visually hidden.
  EN ↔ 中 linked editing (visibility + structure stay aligned), one undo
  history for both languages, drag-and-drop, live fit-to-width A4
  preview with page-break guides, local draft recovery and an overwrite
  guard. See [CV visibility model](#cv-visibility-model).
- **Publications (论文)** — a CV section for papers, preprints and theses
  (authors in order, venue, status, DOI, links, abstract), rendered in
  citation style on `/cv`, `/cv/zh`, the Reading view, the A4 sheet and
  the downloadable CVs (PDF in EN and 中文, plain text, JSON Resume
  `publications`), and on `/publications` with BibTeX / APA copy and
  ScholarlyArticle JSON-LD. The home page can show **Selected
  Publications** (an owner-ordered section, after projects by default),
  the /about rail links the list with its count, ⌘K finds every paper,
  a paper's keywords count as skill evidence, the Home editor suggests
  published papers as proof-strip tiles (verbatim), and CV Studio's
  readiness checks flag a published paper without venue, date or DOI /
  link and a paper "under review" for more than 18 months. The owner's
  own name is emphasised from the public Personal Info; anything not yet
  published carries its real status; a hidden co-author shows as "…" so
  the author order stays true. Nothing is public (no section, no nav
  link, `/publications` answers 404) until a public paper exists. Logic in
  `lib/publications/`.
- **ORCID iD** — the owner's ORCID iD is a Personal Info field in CV
  Studio (checked with ORCID's MOD 11-2 checksum; a pasted
  `https://orcid.org/…` link is stored as the bare iD) with the usual eye
  toggle. Once set it appears as ORCID's display guidelines ask — the
  green iD icon and the full `https://orcid.org/…` link — on `/cv`,
  `/cv/zh`, `/publications` and the /about rail, as a text link in the PDF
  and plain-text CVs, as a JSON Resume profile, in the vCard, in the
  Person JSON-LD (`sameAs` + an ORCID `identifier`, and the papers'
  author `@id`) and as one line of `/llms.txt`; hidden, it appears
  nowhere. **Import from ORCID** in the Publications section lists the
  record's public works (read on the server from ORCID's public API,
  nothing stored), marks the ones already on the CV (same DOI or title)
  and adds the ticked ones as papers to review before saving. **Connect
  your ORCID iD** (next to the field) proves the iD is the owner's by
  signing in to ORCID; until then a typed-in iD is shown with ORCID's
  unauthenticated iD icon and "(unauthenticated)" — see
  [Connect your ORCID iD](#connect-your-orcid-id). Logic in `lib/orcid/`.
- **Admin GUI for non-engineers** — visual editors for hero, brands,
  socials, photo strip, blog posts, case studies, the CV (Studio + raw
  JSON), the Now/Uses pages and the About bio.
- **Per-section visibility and order** — toggle any section of the home
  page (Open Source, Skills, Activity, Projects, Publications, Writing,
  Experience, Certs, Photos, Contact) and drag them into any order, or apply the one-click
  *Recruiter-first* preset, without touching code.
- **Proof strip** — up to four owner-written highlights under the hero, each
  linked to its source; the editor suggests tiles built verbatim from the
  public CV (awards, patents, published papers, education) and nothing
  shows until one is saved.
- **Editable contact panel** — heading, eyebrow, blurb, and the dropdown
  reasons list all come from `data/home.json`; built-in defaults when
  blank.
- **Admin Inbox** — every contact message is stored with its delivery
  status; folders (Inbox / Starred / Archived), the inquiry kind, search
  (`is:unread`, `kind:role`), star, archive, replied, delete with Undo, and
  threaded replies by e-mail with English / 中文 templates — or, without
  SMTP, the same draft through your own mail app.
- **Keyboard-first admin** — ⌘K lists every admin destination and the open
  view's actions; `G` then a letter jumps (`G I` Inbox, `G S` System, …);
  `j` / `k` move through lists; `?` shows a searchable sheet of every key.
- **Industry-grade admin auth** — passkeys (WebAuthn) with one-time recovery
  codes, per-browser sessions, sign-in history and step-up re-verification
  for dangerous actions; scrypt with 16-byte salt; per-(email, IP)
  lockout with a site-wide throughput cap under attack; httpOnly
  + sameSite=Strict + Secure cookies; the Next.js proxy (`proxy.ts`)
  checks the session — signature and revocation — so signed-out visitors
  never see admin UI for a frame; a strict, hash-based CSP, HSTS, COOP /
  CORP, Permissions-Policy and X-Robots on every response.

<table>
<tr>
<td><img src="docs/screenshots/admin-home.png" alt="Admin Home editor" /></td>
<td><img src="docs/screenshots/admin-storage.png" alt="Storage + backup panel" /></td>
</tr>
<tr>
<td align="center"><sub>Admin → Home: visibility toggles + content fields</sub></td>
<td align="center"><sub>Admin → Storage: local SQLite + R2 mirror + tarball snapshots</sub></td>
</tr>
</table>

---

## New in this release

**For visitors**

- **Geist typography** (sans, mono, variable italic), self-hosted under the
  OFL; the old 780 KB of preloaded Inter / JetBrains Mono is gone.
- **Chinese CV at its own URL** — `/cv/zh` with `lang="zh-Hans"`, a Chinese
  title, description, social card and JSON-LD; `/cv?lang=zh|cn` redirects
  (308) and keeps `print=1`. Stable per-entry anchors (`#cv-<section>-<n>`)
  and a print-only QR code that links the live CV.
- **`/colophon`** — how the site is built: stack, fonts, hosting, the
  privacy model, the changelog and the deployed commit.
- **Home** — responsive pre-baked hero image, word-staggered headline,
  cursor-lit cards, a scroll-driven career rail, skills taken from the CV,
  a *Writing & case studies* section and a full-width Field Notes strip with
  a shared-element lightbox. One compact Open Source band (meaningful stats,
  an indigo contribution graph drawn as one path per level with a text
  summary, a single top-five language bar and three pinned repos) is
  rendered into the HTML with only the fields it draws; the contact section
  is the availability card plus a "Write to me" link to `/contact`.
- **About** — a sticky identity rail (portrait, names, availability, CV,
  profiles, section nav) beside the owner's bio (Admin → About bio, omitted
  while empty) and the full bilingual CV, open.
- **Contact** — an availability card (only when the owner sets one), copy
  buttons, a vCard (`/api/vcard`) and a QR code to save it.
- **Articles** — GitHub-flavoured Markdown, zero-layout-shift images with
  `srcset` and tap-to-zoom, YouTube and Figure components, case-study
  covers, heading anchors and a table of contents.
- **Discoverability** — titles that carry the owner's name, ProfilePage /
  Person JSON-LD, social cards in the brand font, and full-content feeds:
  `/feed.xml` (RSS with per-item language), `/work/feed.xml` and
  `/feed.json`, listed in the footer's *This site* column next to the
  colophon and the privacy notes.
- **Command palette 4.0** (⌘K / `/`) — loads on demand, opens at once from
  the keyboard, searches the full content through `/api/search-index`, has
  nested *Theme ›*, *CV ›*, *Contact ›* and *Keyboard shortcuts ›* pages
  (`?`), and gives the signed-in owner an *Admin* group with a route-aware
  *Edit this page*. Visitors also get `J` / `K` through lists, `[` / `]`
  between articles, `T` for the theme and `G` then a letter to jump. Its
  *Keyboard shortcuts: on/off* action (also in the admin `?` sheet) turns
  every single-key shortcut off, per browser.
  Search reads Chinese as well as English (the Chinese CV is indexed; CJK
  words match by character pairs, so 实习, 香港 or 专利 find their entries)
  and understands questions ("Does he have patents?" searches *patents*,
  with English ↔ Chinese synonyms for common recruiter words); results and
  the 404 page's *Did you mean* mark the words that matched.
- **Ask Lucian / 问问 Lucian** — the palette's *Ask* mode (also opened from
  /about and /contact) answers a question in English or Chinese **only with
  quotes from this site** — CV lines, post and page paragraphs — each linked
  to the exact passage (the browser highlights it). Nothing is generated and
  nothing leaves the browser; when no passage matches it says so and offers
  the contact form with the question already in the message. The passages
  come from the public content only (hidden CV fields, entries and
  sections, recommendations without permission and drafts never appear) and
  are rebuilt on every save, so editing the CV is all it takes to change the
  answers.
- **Theme** — System / Light / Dark: a one-tap toggle in the header plus a
  menu beside it, the same three choices in ⌘K and in the mobile menu (one
  stored preference, so all of them agree); dark by default (`NEXT_PUBLIC_DEFAULT_THEME`),
  applied before the first paint so no page ever flashes the wrong mode,
  following the OS while on System.
- **Design system** — fluid type scale, text styles, radii, container widths
  and one motion curve with three durations as tokens (`theme/tokens.ts`),
  a page grid with breakout lines, status and elevation colour tokens, one
  plain section-heading style (no index numbers or bracket labels) and one
  Lucide icon set on the 4 px grid; affiliation logos are measured on save and
  sized optically.
- **Motion with restraint** — circular theme reveal, directional route
  transitions with a pinned header; everything is off under
  `prefers-reduced-motion`, and decorative surfaces have `forced-colors`
  fallbacks.

**For the owner**

- **Status hub** on `/admin`: unread messages, drafts, backup age, pending
  R2 writes and missing configuration, each with its action.
- **Edits that are never lost** — local draft recovery plus `If-Match`
  conflict checks (a *Changed elsewhere* dialog instead of a silent
  overwrite) for posts, case studies, `/now`, `/uses` and the home page.
- **History, recently deleted and undo-delete** for posts, case studies and
  pages.
- **Compile-checked publishing** — an MDX error is reported with its line
  and column before anything is saved; *Publish…* runs a pre-publish
  checklist (title and description length, image alt text, remote images,
  broken internal links); side-by-side live preview with the real renderer
  and Draft Mode at the real URL.
- **Rich editor** — slash-command menu and bubble menus for links and image
  alt text.
- **Image pipeline without an on-request optimizer** — uploads are resized
  into WebP variants with their dimensions recorded (existing uploads can
  be backfilled), and remote images can be imported in one click through
  the SSRF-safe fetcher.
- **Media library** (`/admin/media`) — every upload in a grid or list with
  search and filters (no alt text, unused, missing sizes, large, not in
  R2), where each one is used, default alt text and captions in English and
  中文 that the editor's image picker offers on insertion (and can fill in
  where a page lacks them), *Replace file* (every reference follows; the
  old address redirects), safe delete into a 30-day trash, bulk responsive
  sizes, drag-and-drop uploads and an R2 check.
- **Home editor** — sortable photo / logo / link cards and section order
  (mouse, touch and keyboard), highlights with CV suggestions,
  availability, featured repositories, logo scale, site name.
- **Safer navigation** — *Save and leave / Discard / Stay* instead of a
  browser confirm, a relative "Saved · 12 s ago" status, and a `?`
  shortcuts overlay on every admin page.
- **Analytics tab** — first-party, cookieless page views and real-user Core
  Web Vitals (see [Privacy](#privacy-first-party-analytics)).
- **Scheduled backups** — change-aware whole-site snapshots every
  `BACKUP_INTERVAL_HOURS` (default 24), with the backup age in the Storage
  panel and in the `/api/health` detail (admin or `HEALTH_TOKEN` only).
- **Operability** — structured JSON logs with request ids (`LOG_LEVEL`),
  error boundaries per page region.

**Security and delivery**

- Next.js 16.3 (built with webpack); the image optimizer is disabled
  (`/_next/image` answers 404 — GHSA-2xp9-vwfh-vxw4); the production CSP
  runs scripts by hash only (no `'unsafe-inline'`, no `'unsafe-eval'`) and
  allows no third-party script host.
- HTTP → HTTPS (308) for the public host and the legacy CV redirect in the
  proxy (`proxy.ts`); server-side fetches of admin- or content-supplied URLs
  go through `lib/security/safeFetch.ts`.
- The server's compose override is no longer tracked (loopback-only
  example), container logs rotate, the base image is pinned by digest and
  the release image carries only the traced runtime.
- [Quality gates](#quality-gates) run before each push: a blocking
  production-dependency audit with an expiring allowlist, a performance
  budget, and a container gate that builds the image and runs the
  Playwright + axe end-to-end tests against it.
- [`scripts/deploy.sh`](#deploying-to-production) — health-checked deploy
  with backups and automatic rollback.
- [Versioned Cloudflare configuration](#cloudflare) plus env-gated cache
  purge and IndexNow on every revalidation.

---

## CV visibility model

All flags are optional, so existing CV data keeps working unchanged
(`lib/cvVisibility.ts`):

| Level | Stored as | Effect |
|---|---|---|
| Section | `isVisible: false` | not on the A4 CV / PDF |
| Section | `showOnWebsite: false` | not on `/about` or the home page |
| Entry (any object in a list) | `isVisible: false` | hidden everywhere |
| Field | `hiddenFields: ["gpa"]` on the object | hidden everywhere |
| Bullet / tag | `hiddenItems: { "points": [2] }` on the parent | hidden everywhere |

Public pages call `readPublicCvData('cv' | 'website')`; unauthenticated
`GET /api/cvdata` returns the same pruned view. Only an admin session gets
the full document.

Publication rules hold whatever the switches say: the PDF-only photo of
Personal Info (`photo`, `photoOnPdf`) is removed from every public view —
the server-side PDF reads it through `readCvPdfPhoto(lang)` — a
recommendation is public only when its `permission` is `true`, and the
Studio's dismissed readiness checks (`readinessDismissed`) never leave the
admin.

---

## Writing posts and case studies

Bodies are Markdown (GFM) with a small, eval-free set of MDX components
(`lib/mdx.ts`). Beyond the usual Markdown:

| Write | Get |
|---|---|
| A YouTube or Vimeo link alone in its paragraph (`https://youtu.be/…`, `[Demo](https://vimeo.com/…)`) | A click-to-load player. Its poster is copied once into `/uploads` when you save; nothing loads from YouTube / Vimeo until the reader presses play |
| `> [!NOTE]` (or `TIP`, `IMPORTANT`, `WARNING`, `CAUTION`) as the first line of a quote | A callout, labelled in the article's language |
| `![alt](/uploads/x.webp#wide)` / `#full`, or `<Figure … size="wide" />` | A figure wider than the text column (full: edge to edge on phones). The image bubble in the visual editor sets it |
| Two or more images in a row (blank lines between them, or one per line) | A gallery laid out by the images' shapes; identical captions are shown once |
| `[^1]` footnotes, `<details><summary>…</summary>…</details>` | Styled endnotes and a "deep dive" disclosure |

Case studies have an **At a glance** block in the editor (one-line outcome,
up to four metrics with their source, team, publication date, extra links)
and a cover focal point; the page shows only what is filled in. A new case
study offers a documented template (*The problem → What I learned*); its
guidance notes are MDX comments that never reach the page, and the publish
checklist points at any left behind. A post can name its case study
(*Case study* field) — both pages then link to each other. Tags and stacks
link to `/blog?tag=…` and `/work?tag=…`; `/work` ends with every public CV
project (*All projects*), linked to its case study when there is one.

**Chinese and translations.** A post or case study in Chinese (detected,
or set under *Language & translations* in the editor) gets Chinese
interface words (日期 / 阅读 / ← 全部文章 …) and Chinese typesetting: a
34-character measure, 1.85 leading, spacing between Chinese and Latin
text, emphasis dots. To publish the same piece in English and Chinese,
give both versions the same **translation key** in that block (or press
*Create draft* there to copy the saved version into a new draft in the
other language, then translate it): each page then offers "阅读中文版" /
"Read in English", search engines get hreflang alternates, and the lists
show the piece once, in English. Interface words live in `lib/uiStrings/`.

**Images.** Every image in a post or case study (and every Field Notes
photo on the home page) opens a full-screen viewer that grows out of the
picture and flies back into it: swipe between images, pinch or double-tap
to zoom (the page itself never zooms), drag down to close; with a mouse,
click to zoom and use the wheel; with the keyboard, arrows, + / − / 0 and
Esc. The gesture engine is `components/Common/lightboxEngine.ts`, its
maths `lib/lightboxGestures.ts` and `lib/lightboxPhysics.ts`.

Editing something that is already live never publishes half-done work:
**Save changes** (⌘S) keeps the edits as *unpublished changes* — visitors
see the published version — until **Publish changes…** (with a diff); Preview
shows them at the real address. **Change…** next to the slug moves an item to
a new address: the old one redirects permanently and every internal link is
rewritten. **Search & sharing** under the body sets the search title,
language and "Mark as updated", and previews the Google result and the
LinkedIn, X, WhatsApp, Slack and WeChat cards. The writing bar counts words
(CJK per character), and offers find & replace (⌘F), focus mode and
typewriter scrolling. **Admin → Tags & export** renames or merges tags across
all items and downloads everything as a .zip of Markdown and JSON.

**Publish later, share before.** *Publish… → Schedule…* sets when a draft —
or the saved changes of a live item — goes live, and optionally when it
unpublishes again; times are picked and shown in Hong Kong time (and your
device's, when it differs). The server does it on time with no browser open,
catches up anything it missed while it was down, regenerates the pages,
feeds and sitemap, and logs each action with *Scheduler* as the actor
(`lib/schedule`; the times live in the item's `publishAt` / `unpublishAt`
frontmatter). *⋯ → Share for review…* makes a private link (1 hour – 30 days)
that shows the draft read-only under a "Preview" watermark — never indexed or
cached — counts how often it was opened, and can be turned off at any time
(`lib/review`, tokens signed and stored hashed in `auth.db`). **Admin →
Scheduled & review links** lists both.

---

## Tech stack

| Layer | Choice | Why |
|---|---|---|
| Framework | **Next.js 16 (Pages router, webpack build)** + **React 18** | Mature SSR/ISR, file-routed APIs, a Node.js request proxy |
| UI | **Chakra UI 2** | Composable primitives, dark-mode out of the box |
| Animations | **Framer Motion** | Hero entry, section reveal |
| Content store | **better-sqlite3** + **Cloudflare R2** | Local-first, cheap off-site replica |
| Writing | **MDX** via `unified` (remark-parse, remark-mdx, remark-gfm, remark-rehype) + `rehype-pretty-code` | Compiled to a HAST tree on the server, rendered without `eval` |
| Typography | **Geist / Geist Mono** (self-hosted, OFL) | One variable family for UI, prose and code |
| Backup tarball | **`tar-stream` + `node:zlib`** | One-file atomic snapshot |
| Backup destination | **MongoDB GridFS** *(optional)* | Mirror images + JSON when configured |
| Email | **Nodemailer** | Contact form + password reset |
| Auth | **scrypt + `jsonwebtoken` + `jose` (edge)** | Lockout-aware login, edge JWT verify |
| Editor | **TipTap** (rich) + **Monaco-style JSON** | Block editor for posts + raw JSON for CV |
| Images | **sharp** at upload time | WebP variants + dimensions; no on-request optimizer |
| Testing | **node:test**, **Playwright** + **axe-core** | Unit tests, browser E2E and WCAG 2.2 AA checks |

---

## Project layout

```
.
├── components/          # UI atoms / molecules / organisms
│   ├── Admin/           # HomeEditor, CVEditorStudio, StoragePanel, …
│   ├── LandingPage/     # PersonalInfo, Content, ExperienceTimeline, …
│   └── …
├── content/             # MDX seed data (one-way → DB on first read)
│   ├── blog/*.mdx
│   ├── work/*.mdx
│   ├── now.mdx
│   └── uses.mdx
├── data/                # Runtime state — gitignored
│   ├── content.db       # Canonical SQLite store
│   ├── home.json        # Tracked demo seed for hero/socials/brands/photos
│   ├── cvdata.json      # Tracked demo CV seed (en/zh, fictional)
│   ├── admin.json       # Local admin record (hash + salt)
│   ├── *_snapshots/     # Version history per content kind
│   └── backups/         # snapshot-<UTC>.tgz
├── lib/                 # Server-side libs
│   ├── backup.ts        # Snapshot pack/extract pipeline
│   ├── admin.ts         # scrypt + lockout-aware verify
│   ├── home.ts          # HomeData schema + section keys
│   ├── currentlyCoding.ts # Derive chip from CV
│   ├── db.ts / r2.ts / contentStore.ts
│   └── env.ts / rateLimit.ts / mailer.ts
├── pages/
│   ├── api/             # All server endpoints
│   │   ├── admin/       # Gated: storage, posts, work, page, …
│   │   ├── auth/        # email-login, request-reset, reset-password
│   │   ├── contact*     # Form + nonce
│   │   └── home, cvdata, mongo, og, …
│   ├── admin/           # Gated UI: dashboard, login, forgot, reset, …
│   ├── blog/, work/, now, uses, about, cv, …
│   └── index.tsx
├── scripts/             # CLI helpers: content migrate / push / pull / list,
│                        # deploy.sh, cloudflare-config, check-audit, perf-budget
├── e2e/                 # Playwright + axe end-to-end suites
├── security/            # audit-allowlist.json (reviewed, expiring exceptions)
├── tests/               # node:test unit tests
├── proxy.ts             # Redirects, security headers, CSRF, admin gate (Node.js)
└── public/              # Static assets
```

---

## Quick start

### 1. Clone & install

```bash
git clone https://github.com/hiko-server/landing_page.git
cd landing_page
yarn          # or npm install / pnpm install
```

### 2. Configure env

```bash
cp .env.example .env
# Edit .env — at minimum set ADMIN_EMAIL, ADMIN_PASS, JWT_SECRET
# (use: node -e "console.log(require('crypto').randomBytes(32).toString('base64'))")
```

### 3. Seed local content (first run only)

```bash
yarn content:migrate    # imports content/*.mdx + data/*.json → data/content.db
```

### 4. Dev

```bash
yarn dev                # localhost:3002 (or PORT env)
```

Visit:
- `/` — home
- `/admin/login` — admin entry (covert: there is no visible nav link)

### 5. Production

```bash
yarn build && yarn start
```

Or with Docker (see [Docker](#docker) for the server override):

```bash
cp docker-compose.override.example.yml docker-compose.override.yml   # once
docker compose up -d --build
```

---

## Environment variables

All variables are documented in [`.env.example`](./.env.example). Headlines:

| Group | Vars | Required |
|---|---|---|
| Admin bootstrap | `ADMIN_EMAIL`, `ADMIN_PASS` | ✅ on first boot, then deletable |
| Sessions | `JWT_SECRET` (base64, ≥ 32 bytes) | ✅ always |
| Site identity | `NEXT_PUBLIC_PRODUCT_NAME`, `NEXT_PUBLIC_SITE_HOST`, `SITE_URL` | recommended |
| Default theme | `NEXT_PUBLIC_DEFAULT_THEME` (`dark` when empty, `light` or `system`; build time) | optional |
| Mailer | `SMTP_HOST/PORT/USER/PASS`, `FROM_EMAIL`, `NOTIFY_EMAIL`, `REPLY_FROM_EMAIL` (Inbox replies; defaults to the SMTP account's address) | optional — silently skipped when unset |
| Contact captcha | none — built-in nonce + math + honeypot | n/a |
| GitHub | `GITHUB_TOKEN` (fine-grained, public repositories read-only, no permissions) | recommended (raises API limit 60→5000/h) |
| MongoDB backup | `MONGODB_URI`, `MONGODB_DB_NAME` | optional |
| Cloudflare R2 | `R2_ENDPOINT`, `R2_BUCKET`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_REQUIRED` | optional |
| Scheduled backups | `BACKUP_INTERVAL_HOURS` (default 24, `0` disables) | optional |
| Contact retention | `CONTACT_RETENTION_DAYS` (default 365, `0` keeps messages until deleted) | optional |
| Logging | `LOG_LEVEL` (`debug` / `info` / `warn` / `error`) | optional |
| Cloudflare purge | `CF_ZONE_ID`, `CF_API_TOKEN` | optional — nothing is sent unless both are set |
| IndexNow | `INDEXNOW_KEY` (8–128 of `[A-Za-z0-9-]`) | optional — off unless set |
| Health detail | `HEALTH_TOKEN` (bearer token for monitors) | optional — without it only a signed-in admin sees the `/api/health` detail |
| Admin step-up | `ADMIN_RECENT_AUTH_MINUTES` (1–60, default 10) | optional |
| Restore drills | `RESTORE_DRILL_INTERVAL_HOURS` (default 168, `0` disables) | optional |
| Link check | `LINK_CHECK_INTERVAL_HOURS` (default 24, `0` disables the schedule) | optional |
| Earlier builds' assets | `STATIC_ARCHIVE_DAYS` (days, 1–90, default 7) | optional |
| Image encoding | `IMAGE_JOB_CONCURRENCY` (images encoded at once, 1–4, default 1), `IMAGE_JOB_QUEUE_MAX` (uploads that may wait, 0–64, default 8; beyond that 503 "busy"), `SHARP_CONCURRENCY` (libvips threads per image, 1–4, default the CPUs, at most 2) | optional — the defaults keep concurrent uploads inside the 1 GiB container |
| ORCID connect | `ORCID_CLIENT_ID`, `ORCID_CLIENT_SECRET`, `ORCID_ENV` (`production` default, or `sandbox`) | optional — without them "Connect your ORCID iD" stays disabled ([how](#connect-your-orcid-id)) |

> The repo never commits a real `.env`. `.env.example` contains placeholders
> only — copy and fill in for your own deployment.

---

## Architecture

### Content store (local-first)

```
                ┌─────────────┐
   admin GUI ──▶│ /api/home   │──┐
                │ /api/admin/*│  │
                └─────────────┘  │ dual-write
                                 ▼
            ┌──────────────────────────────┐
            │ SQLite (data/content.db)     │  ← canonical
            └──────────────────────────────┘
                                 │ best-effort
                                 ▼
            ┌──────────────────────────────┐
            │ Cloudflare R2                │  ← off-site mirror
            │ pages/*.mdx, blog/, work/,   │
            │ data/*.json, uploads/,       │
            │ backups/snapshot-<UTC>.tgz   │
            └──────────────────────────────┘
```

- **Reads** prefer SQLite; fall back to filesystem MDX/JSON and seed the DB
  on first call. The legacy `content/*.mdx` and `data/*.json` continue to
  ship in the repo as the bootstrap baseline.
- **Writes** are dual: a synchronous SQLite write *must* succeed; the R2
  push is best-effort and surfaces as `r2Warning` on failure (so the admin
  knows replication is broken, but no data is lost).
- **Container boot** runs `scripts/sync-from-r2.mjs` (set `R2_REQUIRED=1`
  in prod to make missing R2 fatal — otherwise it warns and proceeds).

### Versioned SQLite migrations

Every store (`content.db`, `analytics.db`, `auth.db`) has an ordered list of
migration modules in `scripts/db/<store>/NNN-name.mjs`, applied by
`scripts/db/migrate.mjs` — shared by the app and the plain-Node boot scripts.
Each migration runs in its own `BEGIN IMMEDIATE` transaction together with
its row in `schema_version` (mirrored in `PRAGMA user_version`), so it
applies completely or not at all, exactly once even when several processes
open the store together. Migrations run when a store opens and at server
start; a store that is already versioned is copied aside with `VACUUM INTO`
(`data/backups/pre-migration/`, newest 5) before a new step touches it. Only
additive changes are allowed (rollback safety: the previous image keeps
working on the newer schema). `yarn db:status` shows each store's version;
inside the container: `docker exec <container> node scripts/migrate-db.mjs --status`.

### Backup pipeline

Whole-site atomic snapshots packed by `lib/backup.ts`:

```
MANIFEST.json
db/content.db          ← via SQLite Online Backup API (WAL-consistent)
data/admin.json
data/mongo_config.json
data/snapshots/{cv,home,blog,work,page}_snapshots/**
uploads/*
```

`MANIFEST.json` records every file's size and SHA-256, the row counts and
the schema version of `db/content.db`.

Pipeline: `tar pack → gzip → fs.WriteStream → atomic rename`. Local copy at
`data/backups/snapshot-<UTC>.tgz`, plus R2 push to `backups/<UTC>.tgz` and
`backups/latest.tgz` (the cheap pull target).

Restore is symmetric: extract to a sibling temp dir, close the live DB
handle, swap the file, then mirror trees back over the live ones.

**Restore drills** (`lib/restoreDrill.ts`): every
`RESTORE_DRILL_INTERVAL_HOURS` (default weekly) the newest backup — the R2
`backups/latest.tgz` when configured, else the newest local snapshot — is
extracted into a scratch folder and checked: archive and manifest, every
file's size and SHA-256, `PRAGMA integrity_check`, this build's migrations,
row counts against the manifest, a render of the newest published article.
The live site is never touched; results (and a "Run drill now" button) are
in Admin → System, and a failed or overdue drill is a `/api/health`
warning.

### Error monitoring and system health

First-party only, nothing leaves the server: uncaught browser errors,
unhandled rejections and error-boundary catches (the reporter loads only
when something fails), Content-Security-Policy violations and Trusted
Types reports (`report-to` / `report-uri` → `/api/e`; the report-only
Trusted Types groups are sampled, at most 50 events a group a day, and keep
the sink name, never the sample text), and server errors (API routes, page
renders, the proxy, any logged
exception) are grouped by fingerprint in `data/analytics.db` — scrubbed of
query strings, e-mail / IP addresses, tokens and ID-like numbers, with no
address, user agent or cookie — and listed in Admin → System → Errors
(resolve, ignore, reopen; a resolved error that recurs reopens itself).
Admin → System → Health shows the deployed build, uptime, memory, free
disk, each database's size, WAL and schema version, backups, the restore
drill and the recent warn / error log entries.

**Content health** (Admin → System → Content, summarised on Health): every
published post, case study and page, the CV and the home page are checked
for broken or moved links (a daily, polite external-link check through
`safeFetch` — HEAD first, one request per site at a time, results in
`data/content-health/links.json`; LinkedIn's 999 and bot walls count as
"couldn't verify", never broken), links to missing or draft posts, tracking
parameters in links, images that are missing, hot-linked from another site,
too large, without responsive sizes or with a file name for alt text,
heading structure, duplicate or missing descriptions and hard line breaks.
Safe fixes are one click — strip tracking parameters, import a remote image
into uploads, generate responsive sizes, use a link's new address, remove a
stray break — and go through the editor's own save path (version snapshot,
R2 mirror, page revalidation, refused with 409 when the item changed since
the report); anything that needs your words links to the editor. `j` / `k`
move through the issues, `f` applies the focused fix.

**Activity log** (Admin → System → Activity): every successful admin write —
saves, publishes, restores, deletes, Inbox changes and replies, uploads,
backups, security changes — with who (the signed-in browser: coarse device,
network prefix, country; never a full address), what and when, merged with
the sign-ins and password resets of the sign-in history. It lives in its own
`data/audit.db` (versioned migrations in `scripts/db/audit`, 400 days /
20 000 entries), is copied by the deploy's online backups and is not in the
content snapshots, so restoring content never rewrites it. Writes are
recorded in `withApi` for every route `lib/audit/describe.ts` names; a route
that only knows its action while it runs calls `recordAdminAudit(req, res,
{ action, area, target, summary })` (`lib/audit/record.ts`) after it
succeeded, and a unit test fails when a writing route is in neither. The
version history says which change replaced each version, and its diffs are
word-level (Chinese segmented with `Intl.Segmenter`).

<div align="center">
  <img src="docs/screenshots/admin-storage.png" alt="Storage & backup admin panel" width="780" />
</div>

### Admin security

- **Proxy gate** (`proxy.ts`, Next.js 16's proxy on the Node.js runtime)
  checks the `cv_admin_token` session before any `/admin/*` page or
  `/api/admin/*` route renders: the JWT signature (`jose`, HS256 pinned),
  and revocation — the session version in `data/admin.json` and the
  browser's session row in `data/auth.db` — so a signed-out or revoked
  browser cannot load an admin page shell either. Unauthenticated requests
  are redirected to `/admin/login?next=<original>` for pages, or returned
  as JSON 401 for APIs. Public whitelisted paths: `/admin/{login,forgot,reset}`
  and `/api/admin/{session,logout}`, plus `GET /api/admin/orcid/callback`,
  which authorises itself ([Connect your ORCID iD](#connect-your-orcid-id)).
  Every API route checks the session again itself.
- **scrypt** password hashing (N=16384, r=8, p=1, 64-byte key, async) with
  a per-account 16-byte random salt. Comparisons use
  `crypto.timingSafeEqual` on equal-length buffers.
- **Login throttling**: lockout per (normalised e-mail, client IP) with
  backoff; under sustained failures a site-wide queue caps how fast
  credentials can be tried at all. A signed, long-lived known-device cookie
  (set on successful login) lets the owner skip that queue. Unknown e-mail
  and wrong password get identical responses.
- **Per-IP rate limits** keyed per route (IPv6 bucketed by /64 and /48).
  Client-IP headers (`cf-connecting-ip`) are trusted only from loopback and
  the container's default gateway — how the Cloudflare Tunnel reaches the
  app through the Docker port mapping — unless `TRUSTED_PROXY_IPS` is set.
- **CSRF**: the proxy refuses cross-site (`Origin` / `Sec-Fetch-Site`)
  and non-JSON writes to every admin and content API, on top of
  `SameSite=Strict`.
- **Passkeys** (WebAuthn, `@simplewebauthn/server`): sign in with Face ID /
  Touch ID / Windows Hello / a security key, from the button or the e-mail
  field's autofill; the password stays as a fallback. Ten one-time recovery
  codes (stored as hashes). **Require a passkey** makes the password alone
  insufficient (it then needs a recovery code). Managed in Admin → Security.
- **Sessions**: one row per signed-in browser in `data/auth.db` (the JWT
  carries its id); Log out ends this browser only, Admin → Security lists
  the browsers (coarse device, network prefix, country) and signs any of
  them out, or everywhere. A password reset revokes every session. A
  browser still signed in from before the passkey update has no session
  row: it is listed after its next page view, and signing out any browser
  (this one included) ends every such browser at once.
- **Step-up**: restoring a backup, deleting a post or case study, MongoDB
  restore / target changes and every passkey, code, policy or other-browser
  change need a sign-in or a re-check within `ADMIN_RECENT_AUTH_MINUTES`
  (default 10) — a "Confirm it's you" dialog asks for a passkey or the
  password (+ code) and the action continues.
- **Sign-in history**: sign-ins and security changes (the newest 40 are
  listed). Failed attempts, which anyone can cause, are only counted — per
  hour, method, country and reason code, no address or device — in a table
  of their own and summarised above the list (24 hours, 7 and 30 days), so
  a flood of them can never push a sign-in out of the history.
- **JWT** is HS256 (pinned), 7d expiry, signed with `JWT_SECRET`.
- **Cookies**: `httpOnly`, `sameSite: 'strict'`, `secure` in prod, `path: /`.
- **Reset tokens**: 24 random bytes, 30 min TTL, single-use, constant-time
  compare, pruned on every read.
- **Admin pages**: `X-Robots-Tag: noindex, nofollow, noarchive` and
  `Cache-Control: no-store` to keep them out of search and caches.
- **Redirects** (proxy, GET/HEAD, 308): plain-HTTP requests for
  the configured public host (`SITE_URL` / `NEXT_PUBLIC_SITE_HOST`, never a
  loopback name) go to HTTPS — the visitor's scheme comes from Cloudflare's
  `cf-visitor`, else `X-Forwarded-Proto`; `/api/health` is exempt. The
  legacy `/cv?lang=zh|cn` goes to `/cv/zh`.
- **No image optimizer**: `images.unoptimized` — `/_next/image` answers
  404, so no request ever reaches sharp/libheif (GHSA-2xp9-vwfh-vxw4).
  Images are resized once, at upload time.
- **Strict CSP**: scripts only from this origin and the four inline
  scripts the pages render, allowed by their SHA-256 (computed from the
  same constants, so they cannot drift); no `'unsafe-inline'` or
  `'unsafe-eval'` for scripts (MDX renders from a server-built tree), no
  inline event handlers, same-origin connections, fonts and media.
  Violations go to the site's own Errors panel (`report-to` /
  `report-uri` → `/api/e`). Trusted Types run report-only, with a narrow
  default policy, to map the DOM sinks left before they can be enforced.
  `Cross-Origin-Opener-Policy: same-origin`, `Cross-Origin-Resource-Policy`
  (same-origin, except images and icons other sites may show) and a
  Permissions-Policy that switches off every powerful feature the site does
  not use. Details and the documented exceptions: [SECURITY.md](SECURITY.md).
- **SSRF**: every server-side fetch of a URL that comes from content or an
  admin goes through `lib/security/safeFetch.ts` (public addresses only,
  size, redirect and time limits).

### Connect your ORCID iD

ORCID's iD display guidelines show an iD the researcher proved by signing
in to ORCID with the green iD icon, and one that was only typed in with the
unauthenticated iD icon followed by "(unauthenticated)" ("（未经认证）" on
Chinese pages). CV Studio → Personal Info has **Connect your ORCID iD** next
to the iD field; the site shows the authenticated form once it was used.

1. Sign in at [orcid.org](https://orcid.org) (the record must have a
   verified e-mail address), open **Developer Tools** from the account menu
   (<https://orcid.org/developer-tools>), accept the Public API terms and
   **Register for ORCID Public API credentials** — it is free. Name: the
   site's name; website: the site's URL; description: what the connection
   is for (ORCID shows these on its sign-in screen).
2. Add the redirect URI exactly as the site sends it: `SITE_URL`'s origin +
   `/api/admin/orcid/callback` — for this site
   `https://lucian-dev.com/api/admin/orcid/callback` (ORCID accepts only
   https redirect URIs in production).
3. Put the **Client ID** (`APP-…`) and **Client secret** in the server's
   environment as `ORCID_CLIENT_ID` and `ORCID_CLIENT_SECRET` and restart.
   To try it first, register a client at <https://sandbox.orcid.org/developer-tools>
   (test records; plain-http redirect URIs such as
   `http://127.0.0.1:3000/api/admin/orcid/callback` are accepted there, with
   `SITE_URL` set to that origin) and set `ORCID_ENV=sandbox`.

How it works (`lib/orcid/oauth.ts`, `flow.ts`, `connectRoute.ts`): the
button is a plain link to `GET /api/admin/orcid/connect`, which sends a
signed-in admin to ORCID's OAuth sign-in (authorization code, scope
`/authenticate` only — no access to the record) with a random `state` bound
to that admin session in a signed, single-use, 10-minute, HttpOnly
`SameSite=Lax` cookie scoped to the callback. ORCID sends the browser back
to `GET /api/admin/orcid/callback`; the admin session cookie is
`SameSite=Strict` and does not come along on that cross-site navigation, so
the proxy lets this one route through and the route authorises itself: the
state must match the cookie, be used once and come from a session that is
still live and current. The server exchanges the code at ORCID's token
endpoint (the secret never reaches the browser; the request goes through
`safeFetch` to the one ORCID host, never redirected), stores the confirmed
iD in both languages' Personal Info with the marker
`orcidAuthenticated: { id, at }`, records it in the activity log and
discards the access token. It answers a tiny page that opens the Studio
(a same-origin step, so the Strict cookie is sent again) with a toast.
ORCID does not offer PKCE for this flow (its OpenID configuration lists no
`code_challenge_methods_supported`); the confidential client and the
session-bound state cover what PKCE would.

The marker belongs to the server: a save keeps it only while the CV still
carries it with the same iD, so editing the iD by hand makes it
unauthenticated (Undo in the Studio brings it back before saving), and a
marker typed into the JSON is ignored. **Disconnect** removes the marker and
keeps the iD (now shown as unauthenticated); clearing or hiding the field is
an ordinary edit. Public pages receive the marker only as `{ id }` and only
while the iD is public; the PDF, text and JSON CVs, the vCard and the
JSON-LD carry the iD's URI either way.

### Section visibility

Each home section is gated through `isSectionVisible(home, key)` where
`key ∈ {introduction, highlights, brands, open-source, tech-stack, activity,
projects, writing, experience, certifications, photos, contact}`. Defaults
to *visible* if the key is missing — a clean install keeps the full page.
The numbered sections follow `home.sectionOrder`, read through
`resolveSectionOrder` (`lib/homeSections.ts`): unknown keys are dropped and
a section missing from a stored order is inserted at its default place, so
an older document never hides a section.

Toggle and reorder from **Admin → Home → Sections** (*Recruiter-first* puts
projects, experience, writing and skills before the GitHub activity).

### Currently-coding chip

Three-line chip under the hero avatar (`label / project / note`). Each
field independently follows **admin → CV → blank** precedence:

- If the operator typed something, that wins.
- Otherwise the helper in `lib/currentlyCoding.ts` derives a value from
  `data/cvdata.json`:
  - `label` → `"currently coding"`
  - `project` → the "most relevant current" `workExperience.companyName`
    (prefers ongoing roles by start-date asc; falls back to the most
    recently ended)
  - `note` → `"since <earliest year>"` across all dated CV entries
- The whole chip hides only when all three merged values are empty.

The admin editor surfaces the auto-derived values as input placeholders
plus a small `Auto-derived now: …` footer, so the operator always knows
what visitors will see if they leave a row blank.

---

## Privacy: first-party analytics

The Analytics tab is fed by the site itself (`POST /api/a`); there is no
third-party script and no cookie.

- **Nothing is recorded** when the browser sends `DNT: 1` or `Sec-GPC: 1`,
  for bots, for the signed-in owner (`cv_admin_token` / `cv_admin_hint`
  cookie) and for paths outside the public pages.
- **No IP address and no user agent are stored.** A visitor is
  `sha256(daily salt + site host + IP + user agent)` truncated to 16 hex
  characters. The salt is random, rotates at UTC midnight and exists only
  in memory, so the same person cannot be linked across days (a restart
  also starts a new salt).
- What a page view keeps: path, referrer host (only when it is another
  site), country (Cloudflare's `cf-ipcountry`), coarse device and browser
  class, page language. Web Vitals keep route, metric, value and rating,
  plus a hash of the browser's random per-page-load measurement id, so a
  CLS / INP reported again replaces its earlier value instead of counting
  twice (it identifies a measurement, not a visitor). LCP, INP and CLS also
  keep their attribution — the element as a selector of the site's own
  markup (tag, id, classes; never text, at most 120 characters) and the
  phase timings — which the Web Vitals panel groups per page and element
  (*What makes it slow*).
- **Goal events** (`POST /api/g`, plus three counted on the server): a
  fixed allow-list of eight names, each with at most one bounded property —
  `cv_download` (language × format; counted when `/cv.pdf` & co. are
  fetched, 304 revalidations included, never HEAD), `cv_print` (`en` /
  `zh`), `vcard_save` (server), `email_click` (the page path — never the
  address), `outbound_click` (the destination host only), `contact_sent`
  (server, the inquiry kind only), `read_through` (the article path, once
  the reader reached the end and spent time proportional to its length) and
  `search_empty` (a ⌘K search that found nothing: lowercased, at most 40
  characters, never stored when it contains `@` or six or more digits).
  The same exclusions and per-client / per-network budgets as page views;
  the only visitor value is the same daily hash, which links a visit to a
  download within one UTC day — the Analytics tab shows **Goals**, a
  **Source → CV → Download** conversion and **Searches with no results**,
  counted in *visitor-days*.
- **Storage and retention**: a separate `data/analytics.db` (never part of
  `content.db`, R2 sync or restores). Raw page views are kept 35 days, raw
  Web Vitals 30 days, raw goal events 35 days, daily roll-ups 400 days —
  except `search_empty`, whose raw rows and daily totals are both deleted
  after 35 days.
- **Error reports** (see [Error monitoring](#error-monitoring-and-system-health))
  carry no visitor id either and are dropped under DNT / GPC; they are kept
  at most 90 days.
- `/colophon` states the same facts publicly.

**Exploring the numbers** (Admin → Analytics): pick a period (presets, a
custom range, ‹ › to step back and forth) and *Compare* to draw the period
before it; filter by page, referrer, country, device, browser or page
language from the Filter picker or by clicking any row — every card, the
goals, the conversion, the *Paths to a goal* and the Web Vitals (page and
device only) follow, and the URL keeps the view. Filters read the raw rows,
so a filtered view covers the last 35 days at most and says so; without
filters the whole period comes from the daily totals. Filtering to one page
adds its detail (read to the end, e-mail and outbound clicks, its Web
Vitals); the post editor's ⋯ menu links to it. *Export* downloads the view
as CSV (one table, or all of them in a .zip — never the search texts), and
the *Weekly digest* e-mails last week's totals to `NOTIFY_EMAIL` every Monday
(01:00 UTC) once switched on — it needs SMTP, and the card says how to set
it up. Nothing new is stored about visitors; analytics migration 7 only adds
two indexes and a daily page-language total.

### Contact messages

- The form says what is kept and for how long, next to the Send button.
  A message (name, e-mail, subject, message and the optional structured
  details: reason, kind, company, a link, a timeline) is stored in
  `data/contact-inbox.jsonl` and, with SMTP, e-mailed to the owner. The
  link is https-only and never fetched by the server.
- In Admin → Inbox each message can be starred, archived, marked replied
  and answered by e-mail. A reply is sent **from the SMTP account's own
  address** (so it passes the recipient's DMARC check — a domain with
  `p=reject` would have it refused if it came "from" the domain through
  another provider) with **Reply-To** set to the e-mail the site shows, and
  it threads with the notification you received (Message-ID, In-Reply-To,
  References). Templates (English and 中文, placeholders `{firstName}`
  `{name}` `{subject}` `{me}`) are content and live in the content store;
  statuses and the replies you sent stay on the server next to the inbox
  and are forgotten with the message. Without SMTP the composer explains
  the setup and opens the same draft in your mail app.
- Messages older than `CONTACT_RETENTION_DAYS` (default 365) are deleted by
  a nightly job (03:00 Hong Kong, `lib/inboxRetention.ts`); listings hide
  them before that, a restore never merges them back, and full-site
  snapshots older than the period are pruned too (the newest one is always
  kept). Deploy backups (`/root/landing_page-backups`, ten newest) also hold
  a copy of `data/` and rotate by count.

---

## CLI scripts

```bash
yarn content:migrate    # filesystem → SQLite (idempotent)
yarn content:pull       # R2 → SQLite (overwrites; uses .env)
yarn content:push       # SQLite → R2 (overwrites; uses .env)
yarn content:list       # list R2 objects
yarn run check          # tsc + ESLint + unit tests
yarn e2e                # Playwright + axe against E2E_BASE_URL (default http://127.0.0.1:3000)
yarn audit:deps         # production-dependency audit gate (security/audit-allowlist.json)
yarn db:status          # schema version of each SQLite store (no writes)
yarn db:migrate         # apply pending migrations (also happens on start)
node scripts/perf-budget.mjs          # performance budget over the last `yarn build`
node scripts/subset-fonts.mjs         # re-split the Geist fonts (needs fontTools + brotli)
node --import ./tests/register.mjs scripts/bake-images.mjs           # variants of photos in public/images
node --import ./tests/register.mjs scripts/ci/fixture-store.mjs      # install the CI fixture store into a fresh checkout
node --env-file=.env scripts/cloudflare-config.mjs --dry-run   # Cloudflare zone config
scripts/deploy.sh                     # deploy main to production
```

---

## Docker

```bash
cp docker-compose.override.example.yml docker-compose.override.yml   # once per host
docker compose up -d --build
```

`docker-compose.override.yml` is **not tracked**: each host keeps its own
copy, made from `docker-compose.override.example.yml`. The example binds the
site to `127.0.0.1:3002` only (the Cloudflare Tunnel connects there), replaces
the named volumes with bind mounts of `./data` and `./public/uploads`, and
rotates container logs (`local` driver, 5 × 10 MB). The base file drops every
Linux capability, sets `no-new-privileges` and a PID limit. The root file
system stays writable: ISR rewrites prerendered pages under
`/app/.next/server`; making it read-only would need that directory on a
volume re-seeded from the image on every deploy. A page that turns into a
404 (a deleted or unpublished post or case study, `/publications` without
a paper) has its persisted copies removed there after every content write
and at start (`lib/isrCache`, `lib/isrPages`), because Next would otherwise
serve the last 200 copy again after a restart. The production server
was migrated once — its locally modified, previously tracked override was
set aside, the deletion pulled, and the server copy put back;
`scripts/deploy.sh` does exactly that automatically.

The image is built with BuildKit (`# syntax=docker/dockerfile:1.7`): yarn
and Next caches live in cache mounts, both stages use `node:22-alpine`
pinned by digest (Dependabot proposes digest bumps), glibc sharp binaries
are dropped (Alpine runs musl), and the release stage carries only Next's
traced standalone output — a build-time check proves the content scripts'
modules (`better-sqlite3`, `gray-matter`, `@aws-sdk/client-s3`, `sharp`)
load from it. `NEXT_PUBLIC_BUILD_SHA` (set by the deploy script) puts the
deployed commit on `/colophon`.

The bundled `docker-entrypoint.sh` (under `dumb-init`) runs
`sync-from-r2.mjs` on boot — reconciling the local SQLite store with the R2
mirror by real timestamps, repairing writes that never reached R2 — then
`scripts/static-archive.mjs` (below), then starts the server and
`scripts/warm-isr.mjs`, which regenerates every statically generated page
from the real store (the image is built without a database). `./data` and
`./public/uploads` are persisted through volumes or bind mounts.

**Earlier builds' assets.** Every build has new chunk names, and an image
carries only its own `.next/static`. So that a page loaded before a deploy
(an open tab that lazily loads a chunk, or HTML still in an edge cache)
keeps working, the `landing-static-archive` volume
(`/app/next-static-archive`) collects each build's `/_next/static` files at
start-up and copies the ones of the builds deployed in the last week
(`STATIC_ARCHIVE_DAYS`, default 7) back next to the new build's — never
replacing one of its files (all names are content hashes or the build id).
It holds build output only (a few MB per build) and may be deleted at any
time; the server's override must merge the volume list (no `!override` on
`volumes`), as the example does.

Runtime settings come from `.env` (`env_file`); the public `NEXT_PUBLIC_*`
values are also passed as build args because Next inlines them at build
time.

---

## Deploying to production

`scripts/deploy.sh` is the only deploy path. It runs on your machine and
drives the server over `ssh vultr_tokyo` (an alias in `~/.ssh/config`). The
server has no GitHub credentials: the new commits travel as a git bundle.

```bash
git switch main && git pull && git push   # main == origin/main
scripts/deploy.sh                         # --force rebuilds the deployed commit
```

1. **Preflight** — clean tree, on `main`, `main` pushed to `origin`, the
   server reachable and its HEAD an ancestor of `main` (fast-forward only).
2. **Backups** in `/root/landing_page-backups/<UTC timestamp>/`: an online
   SQLite backup of `content.db` (and `analytics.db`) through the running
   container's better-sqlite3 `.backup()`, a tar of `data/` (without its own
   `backups/`) and `public/uploads/`, copies of `.env` and the compose
   override; the running image is tagged `…:pre-<timestamp>`.
3. **Update** — the checkout fast-forwards from the bundle. The server's own
   `data/home.json` and `docker-compose.override.yml` are kept byte for
   byte; any other local modification stops the deploy. A file the update
   deletes and `.gitignore` now ignores (personal photos taken out of the
   public repository) keeps its server copy.
4. **Build** — `docker compose build` while the old container keeps serving.
   A failed build resets the checkout; nothing else changed.
5. **Switch** — `docker compose up -d --no-build`, then wait for the
   container to be `healthy` and log `[warm-isr] regenerated`, for
   `/api/health` to report `"status":"ok"`, and for the port to be bound to
   `127.0.0.1` only.
6. **Edge purge** — the ISR pages are edge-cacheable, and the previous
   build's HTML points at chunks the new image does not have. Inside the
   new container, `scripts/edge-purge.mjs` purges the Cloudflare zone with
   the app's own `CF_ZONE_ID` + `CF_API_TOKEN` (Cache Purge; the token never
   leaves the server): `purge_everything`, or — if Cloudflare refuses that —
   every cacheable page, feed and sitemap URL in batches of 30. Without the
   credentials (or if the purge fails) the deploy prints a warning and
   carries on: Cloudflare keeps HTML at most 5 minutes anyway (the origin
   sends `Cloudflare-CDN-Cache-Control: max-age=300, stale-if-error=86400`
   on HTML whose own shared lifetime is longer — `/`, `/about`, `/colophon`;
   `lib/edgeHtmlTtl.ts`), and the old HTML still hydrates meanwhile because
   earlier builds' assets are kept (Docker, above). That cap is always on,
   not only without credentials: a purge can fail, the build cannot know
   the runtime credentials, and a refetch from the ISR cache every few
   minutes per edge location costs next to nothing.
7. **Smoke test** through `https://lucian-dev.com`: the main pages, feeds,
   sitemap, health and the legacy CV redirect (cache-busting query, so the
   new origin answers); `/` must reference the new build id
   (`.next/BUILD_ID`). Then `/` without a query string — what visitors get
   from the edge — is checked for the new build id too (a few tries); a
   stale edge copy is reported, not rolled back (the origin is fine, a
   rollback cannot refresh the edge, and the copy still works).
8. **Rollback** on any failure after the switch: `docker tag
   …:pre-<timestamp> …:latest && docker compose up -d --no-build`, the
   checkout reset, the failed container's last 100 log lines and the backup
   paths printed. On success: `.deployed-sha`, image pruning (the three
   newest rollback images are kept) and backup pruning: only the ten newest
   `<UTC timestamp>/` backup directories are kept (each holds a copy of
   `.env`), every removed one is listed, and nothing else in
   `/root/landing_page-backups/` is touched.

Afterwards, run the public E2E suite against production:

```bash
E2E_BASE_URL=https://lucian-dev.com yarn e2e --grep-invert @admin
```

---

## Cloudflare

`scripts/cloudflare-config.mjs` keeps the zone configuration in the
repository and applies it idempotently (read each setting / ruleset, write
only what differs, print the diff; `--dry-run` writes nothing; exits 1 on
any API error). Rules it manages carry a `lp_` ref; rules added in the
dashboard are kept.

- Zone settings: **Always Use HTTPS** on, **Email Address Obfuscation**
  off (its rewritten markup broke React hydration).
- Configuration rule for the site host: email obfuscation off, Web
  Analytics (RUM) injection off — the site has its own analytics and its
  CSP stays unchanged.
- Redirect rule: `www.<host>` → `https://<host><path>` (308, query kept);
  the proxied `www` CNAME is created when missing.
- Cache rules: the public pages, feeds, sitemap, `/api/og`, `/api/stack`,
  `/api/search-index` and `/api/github/*` are cache-eligible with the edge
  TTL taken from the origin (`s-maxage` from ISR pages; server-rendered
  pages send `no-store` and stay uncached); `/admin*`, `/api/admin*`,
  `/api/auth*` and any request with the admin session cookie bypass the
  cache.

```bash
CF_API_TOKEN=… CF_ZONE_ID=… node scripts/cloudflare-config.mjs --dry-run
CF_API_TOKEN=… CF_ZONE_ID=… node scripts/cloudflare-config.mjs
```

Token scopes for this one-off run: Zone Settings:Edit, Config Rules:Edit,
Cache Rules:Edit, Dynamic Redirect:Edit, DNS:Edit, and optionally Account
Analytics:Edit (without it the script prints the manual dashboard step to
turn Web Analytics' automatic setup off).

At runtime, with `CF_ZONE_ID` + `CF_API_TOKEN` (a token with Cache Purge
only) every on-demand revalidation purges the refreshed URLs — plus the
feeds, sitemap and search index when posts or case studies change — in
batches of 30; with `INDEXNOW_KEY` the page URLs are submitted to IndexNow
(the key file is served at the site root as `/<INDEXNOW_KEY>.txt`, because a
key file only covers URLs in its own directory and below; the proxy
rewrites exactly that path to `/api/indexnow-key`). Both are fire-and-forget with a
3 s timeout, logged, and never fail a save; without the env nothing is
sent. The same credentials purge the whole zone after every deploy
(`scripts/deploy.sh`, `scripts/edge-purge.mjs`; check them with
`docker exec <container> node scripts/edge-purge.mjs --dry-run`), and HTML
never stays at the edge longer than 5 minutes
(`Cloudflare-CDN-Cache-Control`, read by Cloudflare only).

---

## Quality gates

There is no hosted CI: run these before pushing to `main`.

| Command | What must pass |
|---|---|
| `yarn run check`, `yarn build`, `node scripts/perf-budget.mjs` | `tsc`, ESLint with zero warnings, unit tests, `next build --webpack`, and the performance budget (shared and per-page first-load JS, shared CSS, number and weight of preloaded fonts) |
| `yarn audit:deps` | `scripts/check-audit.mjs`: no high/critical advisory in production dependencies unless allowlisted in `security/audit-allowlist.json` with a reason and an expiry date; expired entries fail too |
| `scripts/check-container.sh` | the merged compose config publishes loopback only and keeps the hardening and the static-archive volume; the image builds, starts on fresh data holding only the git seeds, serves, warms its ISR pages, runs as uid 1001 with no capabilities and `NoNewPrivs`; the Playwright + axe suite passes against that container in Chromium (desktop, tablet, phone, reduced motion) and WebKit (iPhone), then the `@admin` specs with a throwaway admin (Firefox and the visual baselines run in `scripts/check-fixture-gates.sh`); it stops in under 8 s. Needs Docker, `jq` and `curl`; required for changes to the Dockerfile, `docker-entrypoint.sh` or the compose files, `--no-e2e` skips the suite |
| `scripts/check-fixture-gates.sh` | the synthetic fixture store (`e2e/fixtures/store`: *Example Person*, generated images — never the live content) is built and served in the pinned Playwright image (`mcr.microsoft.com/playwright`, the image the visual baselines were made in): CLS ≤ 0.05 and TBT ≤ 200 ms on a calibrated phone profile; no horizontal scroll at 375 / 768 / 1440 in Chromium, WebKit (iPhone) and Firefox; no image over 200 KB; axe on an article; and the visual baselines of the home page, an article, a case study, the CV and the contact page (dark / light × phone / tablet / desktop). `--update-snapshots` regenerates the baselines after an intended change |

To run the suite against another server, point `E2E_BASE_URL` at it (a local
`yarn start` listens on `http://127.0.0.1:3002`; the default is
`http://127.0.0.1:3000`). The `@admin` specs sign in with `ADMIN_EMAIL` /
`ADMIN_PASS` from the environment (`yarn e2e` does not read `.env`) and
are skipped without them; they change content, so leave them out with
`--grep-invert @admin` for anything but a disposable store.

The E2E suite (`e2e/`) checks every public page on desktop, tablet, phone
and reduced-motion profiles: one visible `h1`, `lang` (`zh-Hans` on
`/cv/zh`), title and description, no serious or critical axe violations
(WCAG 2.0–2.2 A/AA), no horizontal scroll, 24 × 24 px touch targets on
phones (inline text links exempt), nothing animating under reduced motion,
theme persistence, the ⌘K palette and the legacy redirect — and it fails on
any console error, uncaught exception or CSP violation. The `@admin`
specs (local containers only: they change content) sign in, hide and
restore a CV field end to end, provoke a *Changed elsewhere* conflict
between two editors, open the shortcuts overlay and follow a contact
message into the Inbox.

---

## Public routes

| Route | Description |
|---|---|
| `/` | Home — hero, proof strip and the sections in the owner's order (ISR, hourly + on save) |
| `/about` | Identity rail, the owner's bio and the open bilingual CV (ISR, hourly + on save) |
| `/cv` | CV in English (ISR, every minute + on save): A4 sheet / Reading view, skill evidence, downloads; `?print=1` opens the print dialog (every *Download PDF* link uses `/cv.pdf` / `/cv/zh.pdf`) |
| `/cv/zh` | The same CV in Chinese (`/cv?lang=zh` redirects here) |
| `/cv.pdf`, `/cv/zh.pdf` | Server-rendered A4 PDF (tagged, embedded fonts), dated file name, ETag |
| `/cv.txt`, `/cv/zh.txt` | Plain-text CV for paste-in application forms |
| `/cv.json`, `/cv/zh.json` | JSON Resume 1.0.0 of the public CV |
| `/publications` | Papers from the CV's Publications section: citations, links, abstracts, Copy BibTeX / APA, ScholarlyArticle JSON-LD (404 while no paper is public) |
| `/work` | Case-study index (MDX) |
| `/work/[slug]` | Case study page with cover image + body |
| `/blog` | Blog index with tag filters + feed links |
| `/blog/[slug]` | Post: syntax highlighting, table of contents, lightbox images |
| `/now` | "What I'm doing now" page (MDX) |
| `/uses` | Tools, hardware, services page (MDX) |
| `/contact` | Contact page (ISR): structured form with privacy notice, availability, copy buttons, vCard + QR |
| `/colophon` | How the site is built, privacy, changelog, deployed commit |
| `/feed.xml`, `/work/feed.xml`, `/feed.json` | Full-content RSS (writing, case studies) and JSON Feed |
| `/sitemap.xml` | Sitemap with EN / 中 alternates for the CV and for translated posts and case studies |
| `/llms.txt`, `/llms-full.txt` | Index for language models and agents (llmstxt.org) and every published post and case study in full, as Markdown |
| `/blog/[slug].md`, `/work/[slug].md` | Markdown version of a published post or case study (canonical link to the page, `noindex`) |
| `/review/<token>` | A review link: one draft (or unpublished changes) read-only under a "Preview" watermark; private, `no-store`, `noindex`, `no-referrer`; 410 once expired or turned off |
| `/api/search-index` | Public search documents (EN + ZH) and the "Ask Lucian" passages for the command palette |
| `/api/vcard` | vCard of the public contact details |
| `/api/health` | Health: `{"status":"ok"\|"empty"\|"degraded"}` for everyone; store, content, backup age, the restore drill, open errors and pending R2 writes only for an admin or `Authorization: Bearer <HEALTH_TOKEN>` |
| `/api/og` | Social cards: `?card=<id>` for the fixed pages, HMAC-signed parameters for articles; anything else gets the default card |
| `/.well-known/security.txt` | RFC 9116 security contact (public CV e-mail, rolling 180-day expiry; 404 while the e-mail is hidden) |

API surface lives under `/api/*`; admin-only endpoints under `/api/admin/*`
are gated by the proxy (`proxy.ts`).

---

## Admin pages (gated)

| Route | Purpose |
|---|---|
| `/admin/login` | Sign-in (covert: no nav link; reachable via ⌘K palette or URL) |
| `/admin/forgot` + `/admin/reset` | Email-based reset flow |
| `/admin` | Status hub: what needs attention, live counts, links to the editors |
| `/admin/dashboard?tab=home` | HomeEditor — hero, highlights, section order and visibility, availability (job intent, work authorisation), brands, photos, contact form copy and reason kinds |
| `/admin/dashboard?tab=cv` | CV Studio (per-field visibility, hidden-items panel, recruiter-readiness checks — `&panel=readiness`, A4 / website preview) + raw JSON |
| `/admin/dashboard?tab=versions` | Version-history rollback |
| `/admin/dashboard?tab=storage` | SQLite + R2 inventory, manual Backup / Pull |
| `/admin/dashboard?tab=inbox` | Contact Inbox — folders, kinds, search, star / archive / replied, threaded replies with EN / 中文 templates, delete with Undo |
| `/admin/dashboard?tab=analytics` | First-party page views, referrers, devices, real-user Web Vitals, goals, Source → CV → Download and searches with no results |
| `/admin/blog`, `/admin/blog/edit?slug=…` | Blog post manager: drafts, unpublished changes of live posts, publish checklist, live preview, history, slug change with redirect, search & sharing previews |
| `/admin/work`, `/admin/work/edit?slug=…` | Case-study manager (the same tools) |
| `/admin/tags` | Rename, unify or merge post tags and case-study tech; content export (.zip) |
| `/admin/media` | Media library: uploads with where they are used, default alt text and captions, replace, the trash (`?view=trash`), R2 check |
| `/admin/publishing` | Scheduled & review links: what publishes or unpublishes on its own, the scheduler's state, every active review link |
| `/admin/now`, `/admin/uses`, `/admin/about` | One-off page editors (`about` = the bio on /about; empty = no bio section) |
| `/admin/db-config` | MongoDB connection + manual backup/restore |
| `/admin/security` | Passkeys, recovery codes, "Require a passkey", signed-in browsers, sign-in history |
| `/admin/system` | Health (build, disk, databases, backups, restore drill, recent warnings), `?view=content` (content health), `?view=errors` and `?view=activity` (the activity log) |

Press `?` on any admin page for the keyboard shortcuts (searchable). The
admin is keyboard-first: ⌘K / Ctrl+K lists every admin page and the actions
of the view on screen (an admin view adds its own with `useAdminCommands`,
`components/Admin/shell/useAdminCommands.ts`); `G` then a letter jumps —
`D` overview, `I` Inbox, `R` CV Studio, `E` Home editor, `P` posts, `O`
case studies, `M` media, `T` analytics, `V` versions, `F` storage, `S` System, `L`
activity, `Q` content health, `X` errors, `K` security, `Y` scheduled & review links (the public `G H/A/W/B/C/N/U`
work too); lists take `j` / `k`, `Enter`, `x` and their own letters
(Inbox: `r` reply, `s` star, `e` archive, `u` unread, `#` delete, ⌘Z undo).
Single-letter keys follow the *Single-key shortcuts* switch.

<div align="center">
  <img src="docs/screenshots/admin-cv-studio.png" alt="CV Editor Studio" width="780" />
  <br /><sub>Admin → CV → Studio: split-pane editor with live preview</sub>
</div>

---

## Screenshots

Recommended captures live under [`docs/screenshots/`](./docs/screenshots/).
Drop your own files there — see [the index](./docs/screenshots/README.md)
for filenames and content guidance. Do not commit screenshots that
contain real credentials, paid dashboards, or personal contact details.

---

## Security disclosure

If you discover a security issue, please **do not** open a public issue.
E-mail the maintainer at the `Contact:` address in
[`/.well-known/security.txt`](https://lucian-dev.com/.well-known/security.txt)
(RFC 9116; see [SECURITY.md](./SECURITY.md) for scope and response times).
Coordinated disclosure preferred. Each deployment generates its own
security.txt from the public CV e-mail (404 while the CV hides it).

Known limitations (by design, document and accept):
- In-memory rate limiter resets on server restart. Behind a reverse
  proxy or for HA, layer a persistent limiter (Redis, Cloudflare).
- Single admin account per deployment. This is a portfolio CMS, not a
  multi-tenant SaaS.

---

## License

[MIT](./LICENSE) © the contributors.

Fork it, ship your own portfolio, send a PR if you find something rough.
