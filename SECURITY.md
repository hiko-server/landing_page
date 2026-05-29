# Security policy

Thanks for helping keep this project safe.

## Supported versions

Only `main` is supported. There are no release branches — fixes ship as
new commits and a redeploy is the upgrade path.

## Reporting a vulnerability

**Please do not open a public GitHub issue for security bugs.**

Preferred channel:

> [Open a private security advisory](https://github.com/hiko-server/landing_page/security/advisories/new)

This routes the report straight to the maintainer through GitHub's
private flow (encrypted at rest, no public trace until a fix lands).

Acknowledgement target: 72 hours. Initial assessment: 7 days. Coordinated
disclosure preferred — public write-ups land after a patch is available.

### What to include

- A minimal reproduction (URL or curl command + expected vs actual).
- Affected commit SHA from `main` (`git rev-parse HEAD`).
- Your assessment of impact and severity.
- Whether you'd like public credit when the advisory closes.

### Out of scope

- Findings that require physical access to the host machine.
- Self-XSS that requires the victim to paste arbitrary content into
  their own browser console.
- Reports from automated scanners with no manually-verified reproduction.
- Missing security headers on `localhost` development builds.

## Security posture (what this project already does)

- **Edge-middleware admin gate** — `cv_admin_token` JWT verified via
  `jose` before any `/admin/*` page or `/api/admin/*` route renders.
  Unauth requests → `302 /admin/login?next=…` for pages, `JSON 401`
  for APIs.
- **Password hashing** — scrypt (`N=16384, r=8, p=1, 64-byte key`)
  with per-account 16-byte random salt; constant-time compare.
- **Brute-force defence** — per-account lockout (10 fails in a
  rolling 15-min window → 15-min lock, survives IP rotation) layered
  on a per-IP rate limiter (10 login attempts / 5 min).
- **Username enumeration** — scrypt always runs even when the email
  is unknown so response time doesn't leak account existence.
- **Cookies** — `httpOnly` + `sameSite: 'strict'` + `secure` in prod
  + `path: /`. Origin check on `POST /api/auth/email-login`.
- **Reset tokens** — 24 random bytes, 30-min TTL, single-use,
  constant-time compare, pruned on every read.
- **HTTP headers** (via `middleware.ts`):
  `Strict-Transport-Security`, `X-Frame-Options: DENY`,
  `X-Content-Type-Options: nosniff`, `Referrer-Policy`,
  `Permissions-Policy`, restrictive CSP.
  Admin responses additionally carry
  `X-Robots-Tag: noindex,nofollow,noarchive` + `Cache-Control: no-store`.

## Operator responsibilities

This project ships secrets-free, but a deployment is only as safe as
its operator. After cloning:

1. Generate a real `JWT_SECRET`:
   ```bash
   node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
   ```
2. Set `ADMIN_EMAIL` + `ADMIN_PASS` in `.env`. They're consumed on
   first boot to populate `data/admin.json`, then can be cleared.
3. **Never commit `.env`.** It's already in `.gitignore`; double-check
   before your first push.
4. Rotate `GITHUB_TOKEN`, R2 keys, Mongo URI through the providers'
   dashboards on any deploy, even if the same values "look fine".
   Cleartext credentials in `.env` should never be reused across
   personal and production deployments.
5. Set `R2_REQUIRED=1` in production so the container refuses to start
   without a working off-site mirror (default = warn only).
