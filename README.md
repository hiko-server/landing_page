# HIKO.DEV — Personal Site

[![Next.js](https://img.shields.io/badge/Next.js-13.5-black?logo=next.js)](https://nextjs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.3-blue?logo=typescript)](https://www.typescriptlang.org/)
[![Chakra UI](https://img.shields.io/badge/Chakra_UI-2.8-319795?logo=chakraui)](https://chakra-ui.com/)
[![MDX](https://img.shields.io/badge/Content-MDX-1d4ed8)](https://mdxjs.com/)
[![MongoDB](https://img.shields.io/badge/Backup-MongoDB-green?logo=mongodb)](https://www.mongodb.com/)
[![Docker](https://img.shields.io/badge/Docker-Ready-2496ED?logo=docker)](https://www.docker.com/)
[![License](https://img.shields.io/badge/License-MIT-yellow)](LICENSE)

A high-performance personal site + CV management system: data-driven public
pages, a visual admin for non-engineers, file-based MDX for long-form content,
and one-click MongoDB GridFS backup/restore.

**v6** is the current release. It builds on the v5 foundation (Pages Router,
Chakra UI, JSON-FS storage, admin GUI, MongoDB backup) and adds:

- 🎨 **"Indigo Precision" design language** — dot-grid background, Geist-family
  typography, monospace section labels (`[01] WORK ─────`), single indigo
  accent (`#6366f1`)
- ✍️ **MDX content layer** — `/blog`, `/work` (case studies), `/now`, `/uses`
  pages backed by `content/*.mdx` files
- 📝 **Admin editors for blog + case studies** — sit alongside the existing
  Home / CV / Versions / DB editors; same JWT-cookie auth, same auto-snapshot
- 🔐 **Hardening** — `/api/mongo` now requires admin auth; `.env` is no longer
  tracked; `.env.example` has clean placeholders

---

## Table of contents

- [Tech stack](#tech-stack)
- [Project layout](#project-layout)
- [Quick start](#quick-start)
- [Environment variables](#environment-variables)
- [Adding content](#adding-content)
- [Admin pages](#admin-pages)
- [Public routes](#public-routes)
- [API routes](#api-routes)
- [Docker deployment](#docker-deployment)
- [Design tokens](#design-tokens)
- [Security notes](#security-notes)

---

## Tech stack

| Layer | Choice |
|-------|--------|
| Framework | **Next.js 13.5** (Pages Router — preserved from v5) |
| Language | **TypeScript 5.3 strict** |
| UI | **Chakra UI 2.8** themed with v6 design tokens |
| Typography | **Inter** + **JetBrains Mono** via `next/font/google` (Geist is the design ancestor; we use Inter directly because Geist isn't in Next 13.5's bundled Google font list yet) |
| Animation | Framer Motion (used sparingly) |
| Content | **MDX** via `next-mdx-remote` + `gray-matter` + `rehype-pretty-code` (Shiki) |
| Data storage | **JSON files** in `data/` (admin.json / home.json / cvdata.json) — no database required |
| Optional backup | **MongoDB + GridFS** for full-site snapshots (admin-gated) |
| Auth | Self-managed JWT (HS256) in HttpOnly cookie + `scrypt` password hashing |
| Forms | React Hook Form + Formik + Yup |
| Email | Nodemailer (SMTP) |
| CAPTCHA | hCaptcha on contact form |
| Drag-and-drop | `@dnd-kit/*` for the CV section reorder GUI |

---

## Project layout

```
.
├── pages/                       Public + admin routes (Pages Router)
│   ├── index.tsx                /        Home with video bg + hero
│   ├── about/                   /about
│   ├── cv/                      /cv (A4 print) + /cv/edit
│   ├── contact/                 /contact (hCaptcha + SMTP)
│   ├── crypto/                  /crypto (Binance WS live prices)
│   ├── quick-payment/           /quick-payment
│   ├── blog/                    /blog + /blog/[slug]      ← v6
│   ├── work/                    /work + /work/[slug]      ← v6
│   ├── now.tsx                  /now                      ← v6
│   ├── uses.tsx                 /uses                     ← v6
│   ├── admin/                   Admin portal (JWT-protected)
│   │   ├── index.tsx              Entry cards
│   │   ├── dashboard.tsx          Home / CV / Versions tabs
│   │   ├── login.tsx, forgot.tsx, reset.tsx
│   │   ├── db-config.tsx          MongoDB backup/restore UI
│   │   ├── blog/index.tsx         Blog post list      ← v6
│   │   ├── blog/edit.tsx          Blog editor         ← v6
│   │   ├── work/index.tsx         Case study list     ← v6
│   │   └── work/edit.tsx          Case study editor   ← v6
│   ├── api/                     Serverless API endpoints
│   │   ├── admin/                 login / logout / session / upload-image
│   │   │   ├── posts.ts             Blog CRUD          ← v6
│   │   │   └── work.ts              Case study CRUD    ← v6
│   │   ├── auth/                  Email login / reset
│   │   ├── github/                events / stats / top-repos / languages
│   │   ├── contact.ts             hCaptcha + send
│   │   ├── cvdata.ts              CV CRUD + snapshots
│   │   ├── home.ts                Home CRUD + snapshots
│   │   ├── mongo.ts               GridFS backup/restore (JWT-guarded)
│   │   ├── versions.ts            Unified version history
│   │   ├── stack.ts               package.json reflection
│   │   └── rss.xml.ts             Blog RSS feed       ← v6
│   ├── 404.tsx, 500.tsx
│   ├── sitemap.xml.tsx
│   └── _app.tsx, _document.tsx
│
├── components/
│   ├── LandingPage/             Hero, sections, scrollers, ContentPro
│   ├── Header/, Footer/         Top + bottom chrome
│   ├── About/, Background/, BrandShowcase/, Contact/
│   ├── Crypto/, GitHub/, TechStack/, PersonalInstruction/
│   ├── CVViewerPage/            A4-print CV breakdown
│   ├── Admin/                   CVEditor, CVGuiEditorV2, HomeEditor, VersionHistory
│   ├── MDX/                     MDXContent renderer with Chakra overrides ← v6
│   ├── General-UI/              CustomHead, SectionLabel ← v6, ScrollProgressBar, …
│   └── …
│
├── content/                     File-based MDX (v6)
│   ├── blog/                    {slug}.mdx blog posts
│   ├── work/                    {slug}.mdx case studies
│   ├── now.mdx, uses.mdx        Static pages
│   └── .gitkeep files document the frontmatter schema
│
├── lib/                         Server-side utilities (framework-agnostic)
│   ├── admin.ts                 scrypt password hashing + reset tokens
│   ├── cvdata.ts                CV read/write + snapshots
│   ├── home.ts                  Home read/write + snapshots
│   ├── mailer.ts                Dynamic-import nodemailer
│   ├── rateLimit.ts             In-memory token bucket
│   ├── env.ts                   JWT_SECRET validation
│   ├── mdx.ts                   MDX content loader        ← v6
│   ├── mdx-admin.ts             MDX write/delete with auto-snapshot ← v6
│   └── gtag.js
│
├── data/                        Local state (gitignored)
│   ├── admin.json               Admin credentials (scrypt + salt)
│   ├── home.json                Hero / socials / brands / photos / quickAccess
│   ├── cvdata.json              {en, zh} CV section arrays
│   ├── cv_snapshots/            CV version history (auto-saved on every write)
│   ├── home_snapshots/          Home version history
│   ├── blog_snapshots/          ← v6 (blog post snapshots)
│   └── work_snapshots/          ← v6 (case study snapshots)
│
├── public/
│   ├── images/                  brand/, imageScroller/, payment/, hikoAvator.png
│   ├── uploads/                 admin GUI image uploads
│   └── videos/                  hero reels
│
├── styles/
│   └── globals.css              v6 design layer (CSS variables, dot grid,
│                                section-label-rule, link-underline, motion prefs)
│
├── theme/
│   └── chakra.js                Chakra theme — ink scale, accent palette,
│                                semantic tokens, signature dot-grid body bg
│
├── context/                     React Context (auth, settings, cvData)
├── helpers/, hooks/             Client-side utilities
├── layout/                      HeaderFooter, VideoBackgroundLayout, etc.
├── docker/                      Nginx reverse-proxy config
├── *.sh                         build / deploy / docker scripts
└── Dockerfile, docker-compose.yml, .github/workflows/ci.yml
```

---

## Quick start

```bash
# 1. Clone + install
git clone https://github.com/HikoPLi/landing_page.git
cd landing_page
yarn install            # or `npm install --legacy-peer-deps` on Windows

# 2. Configure env
cp .env.example .env
# Edit .env — at minimum set JWT_SECRET (32+ random bytes)
# Generate one: openssl rand -base64 32

# 3. Run dev
yarn dev                # http://localhost:3000

# 4. Build for production
yarn build && yarn start
```

The admin portal lives at `/admin`. On first visit it bootstraps
`data/admin.json` from `ADMIN_EMAIL` / `ADMIN_PASS` in your `.env`.

---

## Environment variables

See [.env.example](.env.example) for the full list. Required for production:

| Variable | Notes |
|----------|-------|
| `JWT_SECRET` | ≥ 32 chars. `openssl rand -base64 32` |
| `ADMIN_EMAIL` + `ADMIN_PASS` | Bootstraps `data/admin.json` on first run |
| `SITE_URL` | Used in password-reset email links |

Optional but recommended:

| Variable | Effect |
|----------|--------|
| `GITHUB_TOKEN` | Raises the GitHub API rate limit (5000/hr instead of 60/hr) used by `/api/github/*` |
| `SMTP_HOST/PORT/USER/PASS/FROM_EMAIL` | Enables the contact form + admin notifications |
| `HCAPTCHA_SECRET` + `NEXT_PUBLIC_HCAPTCHA_KEY` | Required for the contact form to accept submissions |
| `ENABLE_DEMO=true` | Exposes the `/demo/route-planning` demo page |

---

## Adding content

### Blog post

```bash
# Option A — admin UI
# Sign in at /admin/login, click "Blog Posts", click "New Post".

# Option B — by hand
cat > content/blog/my-first-post.mdx <<'EOF'
---
title: My first post
description: A one-line summary that lands in the RSS + meta.
date: 2026-05-28
tags: [engineering, notes]
draft: false
---

Body in **Markdown** + MDX. Code blocks get syntax highlighting:

```ts
const hello = 'world'
```
EOF
```

The post appears at `/blog/my-first-post`, in `/blog`'s index, and in
`/api/rss.xml`. `data/blog_snapshots/` keeps every prior version after each
save.

### Case study

```bash
# content/work/wegreen-ai.mdx
---
title: WeGreen AI
description: Co-founded sustainability AI platform.
role: Co-founder / COT
period: 2024 — Now
tech: [Next.js, FastAPI, MongoDB]
featured: true
status: live
link: https://wegreen.ltd
repo: https://github.com/HikoPLi/wegreen
---

## Problem
…
```

Featured case studies (`featured: true`) get highlighted on `/work`.

### `/now` and `/uses`

Edit `content/now.mdx` or `content/uses.mdx` directly. Each is a single MDX
file with frontmatter (`title`, `description`, `updated`).

---

## Admin pages

All under `/admin/*`, protected by the `cv_admin_token` HttpOnly cookie
(JWT HS256, 7-day expiry).

| Path | What |
|------|------|
| `/admin/login` | Email + password |
| `/admin` | Card grid entry |
| `/admin/dashboard` | Home / CV / Versions tabs (existing v5 functionality) |
| `/admin/db-config` | MongoDB connection + backup/restore (now JWT-guarded) |
| `/admin/blog` | New post + list + edit + delete (v6) |
| `/admin/blog/edit?slug=…` | Editor (v6) |
| `/admin/work` | New case study + list + edit + delete (v6) |
| `/admin/work/edit?slug=…` | Editor (v6) |
| `/admin/forgot`, `/admin/reset` | Password reset via SMTP |

Every write through the admin GUI takes a filesystem snapshot first. CV and
Home snapshots are restorable via `/admin/dashboard?tab=versions`. Blog and
case-study snapshots live in `data/blog_snapshots/` and `data/work_snapshots/`
(restore by copying back into `content/`).

---

## Public routes

| Path | Source |
|------|--------|
| `/` | `pages/index.tsx` — hero + brands + sections |
| `/about` | `pages/about/index.tsx` |
| `/work` | `pages/work/index.tsx` (MDX index) |
| `/work/[slug]` | `pages/work/[slug].tsx` |
| `/blog` | `pages/blog/index.tsx` |
| `/blog/[slug]` | `pages/blog/[slug].tsx` |
| `/cv` | `pages/cv/index.tsx` (A4 print) |
| `/now` | `pages/now.tsx` |
| `/uses` | `pages/uses.tsx` |
| `/contact` | `pages/contact/index.tsx` |
| `/crypto` | `pages/crypto/index.tsx` (Binance WS) |
| `/quick-payment` | `pages/quick-payment/index.tsx` |
| `/sitemap.xml` | Includes every static + MDX route |
| `/api/rss.xml` | Blog RSS 2.0 |

---

## Docker deployment

```bash
# Build + run
docker compose build
docker compose up -d

# Logs
docker compose logs -f
```

The included `Dockerfile` does a multi-stage build (node:22-alpine) and
produces a `standalone` output. Reverse-proxy config for Nginx (mapping
`cv.hiko.dev` to port 4000 and `landing.hiko-prime.com` to port 5000) lives
in `docker/nginx/default.conf`.

Helper scripts:

- `./build.sh` — build the production Docker image
- `./deploy.sh` — restart the container locally
- `./scp_deploy.sh` — ship a tarball image to a server
- `./rebuid.sh` — full build → stop → restart → cleanup
- `./docker_compose.sh` — `docker compose up -d --build`
- `./log.sh` — tail docker logs

---

## Design tokens

The v6 design language is a single set of tokens, fully readable in source:

- **`theme/chakra.js`** — Chakra theme: `ink.0..1000` scale, `accent.50..900`
  indigo palette, semantic tokens (`page.bg`, `page.fg`, `page.muted`,
  `page.border`, `page.surface`), `--font-geist-sans/mono` font hookup,
  signature dot-grid body bg
- **`styles/globals.css`** — CSS variables: `--accent: #6366f1`, dot grid,
  rule colors, `--ease-out-quart`, durations, container widths. Helper
  classes: `.pulse-dot`, `.section-label-rule`, `.link-underline`. Plus
  `prefers-reduced-motion`, print resets, scrollbar styles.

Section labels in code: `<SectionLabel n={1}>Introduction</SectionLabel>` →
`[01] INTRODUCTION ──────`.

---

## Security notes

- **`.env` is gitignored.** `.env.example` documents the placeholders.
- **`/api/mongo` requires admin auth.** All backup/restore endpoints share
  the same JWT-cookie scheme as `/api/cvdata` and `/api/home`.
- **Passwords are stored as `scrypt(password, salt, 64)` hex**, not the
  password itself. Reset tokens expire in 30 minutes.
- **Rate limiting** on contact (5/10min), login (10/5min), CV/Home writes
  (30/10min), blog/work writes (30/10min).
- **CSP, HSTS, X-Frame-Options DENY** set in `middleware.ts` + `next.config.js`.
- If you ever leak secrets into git history (e.g. an early `.env` commit),
  rotate them — `git filter-repo` only helps the future, not anyone who
  cloned before the rewrite.

---

## License

MIT — see [LICENSE](LICENSE).
