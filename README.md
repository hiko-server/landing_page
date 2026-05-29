<div align="center">

# Portfolio Studio

**A self-hostable, content-driven personal site + admin studio.**
Local-first SQLite, off-site Cloudflare R2 mirror, MDX writing, MongoDB
backup, and a hardened admin GUI for non-engineers.

中文版 → [README.zh.md](./README.zh.md)

[![Repo](https://img.shields.io/badge/GitHub-hiko--server%2Flanding__page-181717?logo=github)](https://github.com/hiko-server/landing_page)
[![Next.js](https://img.shields.io/badge/Next.js-13.5-black?logo=next.js)](https://nextjs.org/)
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
  pages backed by typed MDX collections with auto-generated OG images,
  RSS feed, and reading-time annotations.
- **Bilingual CV** — English / 中文 toggle on `/about` and `/cv`; same
  data file (`data/cvdata.json`), zero translation duplication for shared
  fields, rolling version history.
- **Admin GUI for non-engineers** — visual editors for hero, brands,
  socials, photo strip, blog posts, case studies, CV (split-pane Studio
  + raw JSON + legacy GUI), and Now/Uses pages.
- **Per-section visibility** — toggle any `[NN]` row on the home page
  (Open Source, Tech Stack, Activity, Projects, Experience, Certs,
  Photos, Contact) without touching code.
- **Editable contact panel** — heading, eyebrow, blurb, and the dropdown
  reasons list all come from `data/home.json`; built-in defaults when
  blank.
- **Industry-grade admin auth** — scrypt with 16-byte salt; per-account
  lockout (10 fails / 15 min → 15 min lock); per-IP rate limit; httpOnly
  + sameSite=Strict + Secure cookies; JWT via `jose` in edge middleware
  so unauth visitors never see admin UI for a frame; HSTS / CSP / X-Frame
  / X-Robots applied via `middleware.ts`.

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

## Tech stack

| Layer | Choice | Why |
|---|---|---|
| Framework | **Next.js 13 (Pages router)** | Mature SSR, file-routed APIs, edge middleware |
| UI | **Chakra UI 2** | Composable primitives, dark-mode out of the box |
| Animations | **Framer Motion** | Hero entry, section reveal |
| Content store | **better-sqlite3** + **Cloudflare R2** | Local-first, cheap off-site replica |
| Writing | **MDX** via `next-mdx-remote` + `rehype-pretty-code` | Syntax-highlighted prose |
| Backup tarball | **`tar-stream` + `node:zlib`** | One-file atomic snapshot |
| Backup destination | **MongoDB GridFS** *(optional)* | Mirror images + JSON when configured |
| Email | **Nodemailer** | Contact form + password reset |
| Auth | **scrypt + `jsonwebtoken` + `jose` (edge)** | Lockout-aware login, edge JWT verify |
| Editor | **TipTap** (rich) + **Monaco-style JSON** | Block editor for posts + raw JSON for CV |

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
│   ├── home.json        # KV seed for hero/socials/brands/photos
│   ├── cvdata.json      # CV en/zh source of truth
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
├── scripts/             # CLI helpers (migrate / push / pull / list)
├── middleware.ts        # Security headers + admin auth gate
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

Or with Docker:

```bash
docker compose up --build
```

---

## Environment variables

All variables are documented in [`.env.example`](./.env.example). Headlines:

| Group | Vars | Required |
|---|---|---|
| Admin bootstrap | `ADMIN_EMAIL`, `ADMIN_PASS` | ✅ on first boot, then deletable |
| Sessions | `JWT_SECRET` (base64, ≥ 32 bytes) | ✅ always |
| Site identity | `NEXT_PUBLIC_PRODUCT_NAME`, `NEXT_PUBLIC_SITE_HOST`, `SITE_URL` | recommended |
| Mailer | `SMTP_HOST/PORT/USER/PASS`, `FROM_EMAIL`, `NOTIFY_EMAIL` | optional — silently skipped when unset |
| Contact captcha | none — built-in nonce + math + honeypot | n/a |
| GitHub | `GITHUB_TOKEN` (PAT, read-only) | recommended (raises API limit 60→5000/h) |
| MongoDB backup | `MONGODB_URI`, `MONGODB_DB_NAME` | optional |
| Cloudflare R2 | `R2_ENDPOINT`, `R2_BUCKET`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_REQUIRED` | optional |
| Feature flags | `ENABLE_DEMO` | optional |

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

Pipeline: `tar pack → gzip → fs.WriteStream → atomic rename`. Local copy at
`data/backups/snapshot-<UTC>.tgz`, plus R2 push to `backups/<UTC>.tgz` and
`backups/latest.tgz` (the cheap pull target).

Restore is symmetric: extract to a sibling temp dir, close the live DB
handle, swap the file, then mirror trees back over the live ones.

<div align="center">
  <img src="docs/screenshots/admin-storage.png" alt="Storage & backup admin panel" width="780" />
</div>

### Admin security

- **Edge middleware** (`middleware.ts`) verifies the `cv_admin_token` JWT
  with `jose` before any `/admin/*` page or `/api/admin/*` route renders.
  Unauthenticated requests are redirected to `/admin/login?next=<original>`
  for pages, or returned as JSON 401 for APIs. Public whitelisted paths:
  `/admin/{login,forgot,reset}` and `/api/admin/{session,logout}`.
- **scrypt** password hashing (N=16384, r=8, p=1, 64-byte key) with a
  per-account 16-byte random salt. Comparisons use `crypto.timingSafeEqual`
  on equal-length buffers.
- **Per-account lockout**: 10 failed attempts in a rolling 15-minute window
  triggers a 15-minute lock, regardless of the attacker's IP rotation.
  Persisted in `data/admin.json`. Successful login clears the counter.
- **Per-IP rate limit** (10 / 5 min on login, 5 / 10 min on reset request,
  5 / 10 min on contact form).
- **Origin check** on `POST /api/auth/email-login` in production —
  defence-in-depth on top of `SameSite=Strict`.
- **JWT** is HS256, 7d expiry, signed with `JWT_SECRET`.
- **Cookies**: `httpOnly`, `sameSite: 'strict'`, `secure` in prod, `path: /`.
- **Reset tokens**: 24 random bytes, 30 min TTL, single-use, constant-time
  compare, pruned on every read.
- **Admin pages**: `X-Robots-Tag: noindex, nofollow, noarchive` and
  `Cache-Control: no-store` to keep them out of search and caches.

### Section visibility

Each `[NN]` home section is gated through `isSectionVisible(home, key)`
where `key ∈ {introduction, brands, open-source, tech-stack, activity,
projects, experience, certifications, photos, contact}`. Defaults to
*visible* if the key is missing — a clean install keeps the full page.

Toggle from **Admin → Home → Visibility**.

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

## CLI scripts

```bash
yarn content:migrate    # filesystem → SQLite (idempotent)
yarn content:pull       # R2 → SQLite (overwrites; uses .env)
yarn content:push       # SQLite → R2 (overwrites; uses .env)
yarn content:list       # list R2 objects
```

---

## Docker

```bash
docker compose up --build
```

The bundled `docker-entrypoint.sh` runs `sync-from-r2.mjs` on boot, so a
fresh container hydrates from the R2 mirror automatically. Mount `./data`
to a volume to persist the local SQLite + uploads across rebuilds.

Build args from `.env` (R2_*, MONGODB_*, SMTP_*, ADMIN_*, JWT_SECRET) are
passed straight through.

---

## Public routes

| Route | Description |
|---|---|
| `/` | Home — composed `[NN]` sections, gated by visibility |
| `/about` | Long-form intro + GitHub stats + bilingual CV stack |
| `/cv` | Printable CV (browser print-to-PDF target) |
| `/work` | Case-study index (MDX) |
| `/work/[slug]` | Case study page with cover image + body |
| `/blog` | Blog index with tag filters + RSS link |
| `/blog/[slug]` | Post with rehype-pretty-code + reading time |
| `/now` | "What I'm doing now" page (MDX) |
| `/uses` | Tools, hardware, services page (MDX) |
| `/contact` | Dedicated contact page (same component as the home [09]) |

API surface lives under `/api/*`; admin-only endpoints under `/api/admin/*`
are gated by the middleware.

---

## Admin pages (gated)

| Route | Purpose |
|---|---|
| `/admin/login` | Sign-in (covert: no nav link; reachable via ⌘K palette or URL) |
| `/admin/forgot` + `/admin/reset` | Email-based reset flow |
| `/admin` | Portal — links to the editors below |
| `/admin/dashboard?tab=home` | HomeEditor — hero, contact, visibility, brands, photos |
| `/admin/dashboard?tab=cv` | CV Studio (split-pane) + raw JSON + legacy GUI |
| `/admin/dashboard?tab=versions` | Version-history rollback |
| `/admin/dashboard?tab=storage` | SQLite + R2 inventory, manual Backup / Pull |
| `/admin/blog`, `/admin/blog/edit?slug=…` | Blog post manager |
| `/admin/work`, `/admin/work/edit?slug=…` | Case-study manager |
| `/admin/now`, `/admin/uses` | One-off page editors |
| `/admin/db-config` | MongoDB connection + manual backup/restore |

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
Use [GitHub's private security advisory flow](https://github.com/hiko-server/landing_page/security/advisories/new)
or email the maintainer directly. Coordinated disclosure preferred.

Known limitations (by design, document and accept):
- In-memory rate limiter resets on server restart. Behind a reverse
  proxy or for HA, layer a persistent limiter (Redis, Cloudflare).
- Single admin account per deployment. This is a portfolio CMS, not a
  multi-tenant SaaS.

---

## License

[MIT](./LICENSE) © the contributors.

Fork it, ship your own portfolio, send a PR if you find something rough.
