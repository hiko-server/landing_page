---
name: Bug report
about: Something is broken or doesn't behave as documented
title: 'bug: '
labels: ['bug', 'needs-triage']
assignees: []
---

## Summary

<!-- One sentence: what's broken? -->

## Reproduction

<!-- Minimal repro. If a route is involved, include the path. If an admin
     action triggers it, include the click path. The more specific the
     faster the fix. -->

1.
2.
3.

## Expected behaviour

<!-- What should happen? Link to the README section / commit if you're
     reporting a regression. -->

## Actual behaviour

<!-- What happens instead? Paste the toast text, error message, or
     screenshot. -->

## Environment

- Commit SHA on `main`: `git rev-parse HEAD` →
- Node version: `node -v` →
- Browser + OS:
- Running mode: [ ] `yarn dev`  [ ] `yarn start` (prod)  [ ] Docker
- R2 configured? [ ] yes  [ ] no
- Mongo configured? [ ] yes  [ ] no

## Console / server logs

<details>
<summary>Browser console</summary>

```
paste relevant errors here
```
</details>

<details>
<summary>Server logs (yarn dev / docker logs)</summary>

```
paste relevant lines here
```
</details>

## Checklist

- [ ] I searched existing issues and didn't find a duplicate.
- [ ] I'm on a recent commit of `main` (not a stale fork).
- [ ] I've confirmed this is **not** a security issue. (If it is, do
      not submit a public issue — see [SECURITY.md](../../SECURITY.md).)
