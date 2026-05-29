# Changelog

All notable changes to this project will be documented in this file.

The format is loosely based on [Keep a Changelog](https://keepachangelog.com/),
and this project does not yet follow semver in earnest (single-deployment
portfolio CMS, no public package). Entries are grouped by release date.

## [Unreleased]

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
