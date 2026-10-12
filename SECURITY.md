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

## Security posture

What the code actually does today, and where its limits are.

### Authentication and sessions

- **Single admin account** stored in `data/admin.json` (bind-mounted,
  gitignored, written atomically with mode `0600`). Bootstrapped from
  `ADMIN_EMAIL` / `ADMIN_PASS` on first use.
- **Password hashing** — scrypt (`N=16384, r=8, p=1`, 64-byte key) with a
  random 16-byte salt; constant-time compare.
- **Session cookie** — `cv_admin_token`, an HS256 JWT (algorithm pinned on
  verify) valid for 7 days; `httpOnly`, `SameSite=Strict`, `Secure` in
  production, `path=/`.
- **Two-layer gate** — the edge middleware does a fast signature check for
  every `/admin/*` page (guests → `302 /admin/login?next=…`) and
  `/api/admin/*` route (guests → JSON `401`). Every API handler then calls
  `lib/auth.ts`, which additionally enforces session revocation.
- **Session revocation** — `data/admin.json` holds `sessionVersion`; every
  token carries it as the `sv` claim and is honoured only while the two
  match. The version is bumped by:
  - **Log out** (`POST /api/admin/logout`) — this signs out **every**
    browser and device, not just the current one. An anonymous logout
    request only clears its own cookie; it cannot revoke the owner's
    sessions.
  - **Password reset** — also burns all outstanding reset links.

  Tokens issued before this existed have no `sv` and count as version 0,
  the value a record without `sessionVersion` has, so an upgrade does not
  log anyone out. Because the edge middleware cannot read the filesystem,
  a revoked token can still load an admin page shell until it expires, but
  every admin API it calls answers `401` and `/api/admin/session` reports
  `authenticated: false`.

### Login brute-force defence (`lib/security/loginThrottle.ts`)

Designed so that it cannot be turned into a lock-out weapon against the
owner:

- **Per (email, client) lockout with exponential backoff** — 4 free
  mistakes; the 5th locks that email *for that client network* for 30 s,
  then 60 s, 2 min, … up to 1 h. History is forgotten after 24 h without a
  failure, and a successful login clears it. An attacker only ever locks
  out their own network; the owner signing in from anywhere else is
  unaffected.
- **Per-IP limits** — 10 login attempts per 5 min (tightened to 4 while
  the site is under a distributed attack) and 30 per hour.
- **Global slowdown, never a global lockout** — once 30+ failures from all
  clients land within 15 min, every login response is delayed (0.5 s per
  30 failures, up to 4 s), success and failure alike.
- **No account enumeration** — unknown emails go through the exact same
  path as wrong passwords: one scrypt hash, the same throttling state,
  the same `401 Invalid credentials`, and the same generic `429` lockout
  message, which never confirms an address. Password-reset requests always
  answer `{ ok: true }` without waiting for SMTP, and at most 3 reset links
  can be outstanding at once (no inbox flooding).
- Throttle state lives in process memory and is bounded; a restart (which
  only the operator can trigger) clears it.

### Client IP (`lib/rateLimit.ts`, `lib/security/ip.ts`)

- The client address comes from `TRUST_CLIENT_IP_HEADER` (default
  `cf-connecting-ip`, which Cloudflare overwrites at its edge), falling back
  to the TCP peer when the header is missing or malformed.
- `TRUSTED_PROXY_IPS` (IPs and CIDRs, IPv4 and IPv6) restricts header trust
  to requests that arrive from those proxies. `x-forwarded-for` is read
  right-to-left, skipping trusted hops.
- IPv6 clients are rate-limited per `/64`, so one end-user network can't
  rotate through fresh addresses.

### CSRF (`middleware.ts`, `lib/security/csrf.ts`)

For `POST` / `PUT` / `PATCH` / `DELETE` to `/api/admin/*`, `/api/auth/*`,
`/api/cvdata`, `/api/home`, `/api/versions` and `/api/mongo`:

- `Sec-Fetch-Site: same-origin` or `none` → allowed.
- Otherwise an `Origin` header, when present, must match the request host
  (`Host` / `X-Forwarded-Host`) or the configured site (`SITE_URL`,
  `NEXT_PUBLIC_SITE_HOST`); `Origin: null` and foreign origins → `403`.
- Requests with neither header (curl, scripts) are allowed — they carry no
  ambient browser cookie, and privileged routes still need a valid session.
- Form-encoded, multipart and `text/plain` bodies → `415`. These endpoints
  only accept JSON (or no body), which a cross-site page cannot send
  without a CORS preflight that this site never grants.
- `SameSite=Strict` on the session cookie is the second, independent layer.

### Uploads

- Admin-only; MIME allow-list (PNG, JPEG, WebP, GIF, AVIF) checked against
  the file's magic bytes, ≤ 8 MB, canonical extension forced.
- One filename rule (`lib/security/uploadName.ts`) is shared by the upload
  endpoint and the `/uploads/*` file server: a single segment of
  `[A-Za-z0-9._-]`, no leading dot, no `..`. Every stored name is therefore
  servable and included in snapshot backups. Names are never overwritten
  (collisions get a content-hash suffix).
- Served files carry `X-Content-Type-Options: nosniff` and a sandboxing
  `Content-Security-Policy`, so even an SVG opened directly can't run script.

### Other endpoints

- **Contact form** — signed nonce (2 s minimum fill time), honeypot, per-IP
  limit; header-injection-safe; undelivered mail is kept in
  `data/contact-inbox.jsonl` rather than dropped.
- **`/api/og`** — text clamped by code point, per-IP render limit (60/min),
  `Cache-Control: public, max-age=86400, s-maxage=31536000, immutable` so
  repeat crawls are served by the CDN.
- **MongoDB backup target** (`/api/mongo`, admin-only) — connection strings
  are masked by a URI-grammar parser that also handles multi-host URIs and
  passwords containing `@` or `/`; secret query options are redacted; error
  messages are scrubbed of the password before they are logged or returned.
  Admin credentials are never backed up to or restored from Mongo.
- **Public content APIs** return only the public (visibility-pruned) view of
  the CV and home documents; the full documents are served to the admin
  only, with `Cache-Control: no-store`.

### HTTP headers (`middleware.ts`, `next.config.js`, `lib/csp.js`)

`Strict-Transport-Security` (2 years, preload), `X-Frame-Options: DENY`,
`X-Content-Type-Options: nosniff`, `Referrer-Policy:
strict-origin-when-cross-origin`, `Permissions-Policy`, and one shared CSP.
Admin responses add `X-Robots-Tag: noindex, nofollow, noarchive` and
`Cache-Control: no-store`.

Known CSP loosenings (documented in `lib/csp.js`): `script-src` includes
`'unsafe-eval'` (MDX pages are compiled at runtime) and `'unsafe-inline'`
(Next/Chakra inline bootstrap and styles). XSS defence therefore rests on
React escaping and on the link sanitiser (`lib/cvFormat.ts` `safeHref`)
rather than on the CSP.

## Operator responsibilities

This project ships secrets-free, but a deployment is only as safe as
its operator. After cloning:

1. Generate a real `JWT_SECRET`:
   ```bash
   node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
   ```
2. Set `ADMIN_EMAIL` + `ADMIN_PASS` in `.env`. They're consumed on
   first boot to populate `data/admin.json`, then can be cleared.
   To revoke every session without changing the password, sign in and
   use **Log out** (it signs out everywhere).
3. **Never commit `.env`.** It's already in `.gitignore`; double-check
   before your first push.
4. Rotate `GITHUB_TOKEN`, R2 keys, Mongo URI through the providers'
   dashboards on any deploy, even if the same values "look fine".
   Cleartext credentials in `.env` should never be reused across
   personal and production deployments.
5. Behind a proxy other than Cloudflare, set `TRUST_CLIENT_IP_HEADER`
   (and ideally `TRUSTED_PROXY_IPS`) so rate limits see real client
   addresses; see `.env.example`.
6. Set `R2_REQUIRED=1` in production so the container refuses to start
   without a working off-site mirror (default = warn only).
