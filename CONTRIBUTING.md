# Contributing

Thanks for considering a contribution. The bar is "make it better, ship
small". Anything from typo fixes to architectural rework is welcome —
just keep PRs focused and the diff understandable.

## Quick start

```bash
git clone https://github.com/hiko-server/landing_page.git
cd landing_page
yarn
cp .env.example .env
# Fill in JWT_SECRET (required) and ADMIN_EMAIL/ADMIN_PASS (first-boot bootstrap)
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
yarn content:migrate   # seed data/content.db from filesystem MDX/JSON
yarn dev
```

Visit:
- `/` — public site
- `/admin/login` — admin (no visible nav link; reach via ⌘K palette or
  the URL directly)

## Reading the code first

Before changing anything, the docstrings in these files set up the
mental model:

- `lib/contentStore.ts` — local-first SQLite + R2 dual-write.
- `lib/backup.ts` — whole-site tarball snapshots.
- `lib/admin.ts` — scrypt hashing + per-account lockout policy.
- `middleware.ts` — admin route gate + security headers.
- `lib/homeShape.ts` vs `lib/home.ts` — server-only vs client-safe
  split (do NOT collapse them, see the comment block in `home.ts`).

## Design tokens

Typography, radii, container widths and motion are tokens in
`theme/tokens.ts`; colours (contrast-tested light/dark pairs) and the
three elevation shadows are in `theme/color.ts`. `theme/chakra.js`
registers them with Chakra; their CSS custom properties (`--ease-standard`,
`--duration-*`, `--container-*`, `--page-gutter`, `--elevation-*`) are
mirrored as static CSS in `styles/globals.css` — tests keep the two
identical, so change a value in the `.ts` source and in `globals.css`.
In a Chakra `Heading` (which brings its own responsive sizes) spread
`{...textStyleProps('title-lg')}` instead of `textStyle="title-lg"`.

- **Type**: a fluid scale (clamp between a 360 px and a 1280 px viewport)
  with named text styles — `textStyle="label"` (mono caps), `"meta"`,
  `"small"`, `"lede"`, `"title-sm"` … `"title-xl"`, `"section"`,
  `"display"`, `"stat"`; or a size alone: `fontSize="caption"`. Tracking:
  `letterSpacing="caps"`.
- **Section headings**: every page section opens with
  `components/General-UI/SectionHeading.tsx` — the plain sans `section`
  text style, its `id` on the heading, an optional quiet `aux` (a count)
  at the far end. No index numbers ("[01]"), no brackets and no mono
  uppercase eyebrows as section headings on public pages; `textStyle="label"`
  is for small labels, chips and PageHeader's kicker above the h1.
- **Radii**: `control` (buttons, inputs), `card`, `panel`, `pill`.
- **Layout**: `components/General-UI/PageGrid.tsx` — the page column with
  named `content` / `wide` / `full` lines (`<Breakout span="wide">`).
- **Motion**: one ease and three durations — `var(--ease-standard)`,
  `var(--duration-fast | -base | -slow)` (0ms under
  `prefers-reduced-motion`), or from TypeScript `cssTransition()` and
  `motionTransition(duration, reduce)` for framer-motion.
- **Icons** on public pages: Lucide (ISC) in `components/Icons/ui/`,
  sized on the 4 px grid with `size="xs" | "sm" | "md" | "lg"`. Import from
  the group file — `ui/chrome` (shared header / footer, keep it small),
  `ui/theme` (on-demand theme menu), `ui/content` (page chunks) — never
  through a barrel. Brand marks are in `components/Icons/brand.tsx`.

**The guard.** Lint runs with `--max-warnings 0`, so the token rule cannot
be a warning across the whole codebase while older components still use
raw values. Instead it is an *error* on the components already migrated:
the `no-restricted-syntax` override in `.eslintrc.json` rejects raw
px / em `fontSize`, `letterSpacing` and `lineHeight` values,
`cubic-bezier(…)` literals and inline framer-motion ease arrays there.
When you migrate a component (no blanket codemods — one component at a
time, checked in both themes), add its path to that override's `files`.

## Local checks before pushing

```bash
npx tsc --noEmit       # type-check (must pass)
yarn lint              # ESLint, zero warnings
yarn build             # full build, ~30s
```

There is no hosted CI, so these checks are the gate: run them (plus
`yarn test`) before every push to `main`, and `scripts/check-container.sh`
too when the Dockerfile, `docker-entrypoint.sh` or a compose file changes.
README → *Quality gates* lists the full set.

## Branch + commit conventions

- **Branch off `main`.** No long-lived feature branches.
- **Conventional commits:** `feat:`, `fix:`, `docs:`, `chore:`,
  `refactor:`, etc., with an optional scope:
  `feat(admin): editable contact panel`,
  `fix(security)!: gate /admin via edge middleware`.
- Use `!` after the scope when a commit changes behaviour an operator
  cares about (auth surface, env-var requirements, breaking schemas).
- Bodies wrap at ~78 cols and explain the *why*, not the *what* —
  the diff already shows the what.

## Pull-request checklist

Before opening a PR:

- [ ] `npx tsc --noEmit` is green.
- [ ] `yarn build` succeeds.
- [ ] No new ESLint errors (warnings OK).
- [ ] You ran the relevant pages in `yarn dev` and they render.
- [ ] You did NOT commit `.env`, `data/admin.json`, or any other file
      gitignored under `data/`.
- [ ] If your change touches the admin UI, you confirmed the middleware
      still blocks unauth visitors from the page you added.
- [ ] If your change is user-visible, the README (or `README.zh.md`) is
      updated to match.

## What "non-trivial" means for review

These changes deserve extra scrutiny — call them out in the PR body:

- New endpoints under `/api/admin/*` or `/api/auth/*`.
- Any change to `middleware.ts`, `lib/admin.ts`, or
  `pages/api/auth/email-login.ts`.
- New ambient cookies, headers, or env-var requirements.
- New runtime dependencies (especially anything with native bindings
  like `better-sqlite3` — adds Docker build complexity).
- Schema changes to `HomeData` (`lib/homeShape.ts`) or `cvdata`.

## Anti-goals

- **No multi-tenancy.** This is a portfolio CMS, one admin per
  deployment. If your change requires multiple admins, it's a fork.
- **No commits to `data/admin.json`, `data/cvdata.json`,
  `data/home.json`** unless you're updating the structure (in which
  case explain why in the commit body). The tracked copies are a
  fictional demo profile; real content lives only in the server's
  content store. Never commit personal details (names, phone numbers,
  addresses, photos) into them.
- **No `.env` commits**, ever. If you accidentally stage one,
  `git restore --staged .env`. If you accidentally *pushed* one,
  rotate every secret in it and e-mail the maintainer privately (the
  address is in the site's `/.well-known/security.txt`; see `SECURITY.md`).

## Reporting bugs / requesting features

Use the templates under `.github/ISSUE_TEMPLATE/`. Reproducible bugs
with a minimal repro path get fixed fastest.

## License

By contributing you agree your work is released under the MIT license
that covers the rest of the project (see `LICENSE`).
