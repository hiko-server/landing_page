<!--
  Thanks for the PR.

  Title format: `<type>(<scope>): <imperative summary>`
    e.g. `feat(admin): editable contact panel`
         `fix(security)!: gate /admin via edge middleware`
  Use `!` after the scope when an operator needs to do something on upgrade
  (env-var rename, schema migration, cache invalidation, etc.).
-->

## What

<!-- One short paragraph: what does this PR change? -->

## Why

<!-- The motivation. Link the issue if there is one (`Closes #123`). -->

## How

<!-- Notable implementation choices, trade-offs, alternatives rejected.
     Skip for one-line typo fixes. -->

## Screenshots / before-after

<!-- For UI changes, drop in before/after PNGs at retina (~2x). For
     headless captures see scripts/_take-screenshots.mjs. -->

## Checklist

- [ ] `npx tsc --noEmit` is green.
- [ ] `yarn build` succeeds.
- [ ] `yarn lint` shows no NEW errors (warnings OK).
- [ ] I manually exercised the affected pages in `yarn dev`.
- [ ] No `.env`, `data/admin.json`, or other gitignored content is in
      this diff.
- [ ] If this touches `middleware.ts`, `lib/admin.ts`, or any
      `/api/auth/*` endpoint, I've re-read SECURITY.md and confirmed
      the change doesn't widen the attack surface.
- [ ] If this changes the `HomeData` shape, I updated
      `lib/homeShape.ts` (not `lib/home.ts`) and the renderer +
      admin editor both compile.
- [ ] Docs updated if the change is user-visible (README,
      README.zh.md, CHANGELOG.md).

## Out of scope

<!-- Anything you explicitly chose NOT to do in this PR — useful for
     reviewer expectations and follow-up issues. -->
