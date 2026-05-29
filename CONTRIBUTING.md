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

## Local checks before pushing

```bash
npx tsc --noEmit       # type-check (must pass — CI gate)
yarn lint              # ESLint (warnings allowed in CI for now)
yarn build             # full build, ~30s
```

The harness in `.github/workflows/ci.yml` runs the same three steps on
every push / PR to `main`.

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
  case explain why in the commit body). Those files contain the
  maintainer's personal content; forks should overwrite them locally,
  not push to upstream.
- **No `.env` commits**, ever. If you accidentally stage one,
  `git restore --staged .env`. If you accidentally *pushed* one,
  open a private security advisory (see `SECURITY.md`).

## Reporting bugs / requesting features

Use the templates under `.github/ISSUE_TEMPLATE/`. Reproducible bugs
with a minimal repro path get fixed fastest.

## License

By contributing you agree your work is released under the MIT license
that covers the rest of the project (see `LICENSE`).
