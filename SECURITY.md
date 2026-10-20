# Security policy

Thanks for helping keep this project safe.

## Supported versions

Only `main` is supported. There are no release branches — fixes ship as
new commits and a redeploy is the upgrade path.

## Reporting a vulnerability

**Please do not open a public GitHub issue for security bugs.**

Report privately by e-mail to the address in the site's
[`/.well-known/security.txt`](https://lucian-dev.com/.well-known/security.txt)
(RFC 9116). Its `Contact:` line is the maintainer's public e-mail, taken
from the CV the site publishes, and its `Expires:` date always lies about
six months ahead. GitHub's private vulnerability reporting is not enabled
for this repository, so e-mail is the channel.

Every deployment of this project serves its own file at
`https://<host>/.well-known/security.txt` (`pages/api/security-txt.ts`,
`lib/securityTxt.ts`): the contact comes from the public CV, and the file
answers `404` while the CV hides its e-mail address.

Acknowledgement target: 72 hours. Initial assessment: 7 days. Coordinated
disclosure preferred — public write-ups land after a patch is available.

### What to include

- A minimal reproduction (URL or curl command + expected vs actual).
- Affected commit SHA from `main` (`git rev-parse HEAD`).
- Your assessment of impact and severity.
- Whether you'd like public credit when the fix is published.

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
- **Sessions** (`lib/adminAuth/sessions.ts`, `data/auth.db`) — every sign-in
  creates a session row; the JWT carries its id (`sid`) and is honoured only
  while the row exists, is not revoked and has not expired. Admin → Security
  lists the signed-in browsers (browser · OS, an IPv4 /24 or IPv6 /48 prefix,
  the Cloudflare country — never a full address or user agent) and signs any
  of them out. **Log out** (`POST /api/admin/logout`) signs out this browser
  only; "Sign out everywhere" (Security page) also bumps the session version.
  An anonymous logout request only clears its own cookies.
- **Session version** — `data/admin.json` holds `sessionVersion`; every
  token carries it as `sv` and is honoured only while the two match. It is
  bumped by "Sign out everywhere" and by a **password reset** (which also
  burns all outstanding reset links and revokes every session row). A token
  minted before sessions existed (no `sid`) still needs a matching `sv`; the
  first page view swaps it for one bound to a new row. Because the edge
  middleware cannot read the filesystem, a revoked token can still load an
  admin page shell until it expires, but every admin API it calls answers
  `401` and `/api/admin/session` reports `authenticated: false`.
- **Passkeys** (`lib/adminAuth/passkeys.ts`, @simplewebauthn/server) — sign
  in with a passkey (button, or the e-mail field's autofill) instead of the
  password. The relying-party id is the configured public host (a request's
  Host never becomes it) or `localhost` for local work; IP hosts have none.
  User verification is required, attestation is not requested, challenges
  are 32 random bytes, single use and expire after 5 minutes (registration
  and step-up challenges are bound to the session), the signature counter is
  enforced, and an unknown credential is reported so the browser can forget
  it. Registration needs a recent verification.
- **Recovery codes** — ten per set, 80 random bits each (Crockford base32),
  stored only as SHA-256, each usable once; shown once when created (with
  the first passkey, or on request).
- **"Require a passkey"** — once on, the password alone neither signs in nor
  verifies: it needs a recovery code too. Without a code the sign-in answers
  `403 PASSKEY_REQUIRED` before any password check; a wrong password and a
  wrong code get the same `401`, and a wrong code counts for the lockout.
- **Step-up** (`lib/adminAuth/stepUp.ts`) — restoring a backup, deleting a
  post or case study, MongoDB restore or target changes, and every passkey,
  recovery-code, policy or other-browser change require a sign-in or a
  re-verification on this browser within `ADMIN_RECENT_AUTH_MINUTES`
  (default 10); otherwise the route answers `403 STEP_UP_REQUIRED` and the
  admin asks for a passkey or the password (+ code). A token from before
  sessions existed never counts as recent.
- **Sign-in history** — sign-ins, failures (time, method, country and a
  reason code; no address or device) and security changes, the newest 500
  for at most 180 days.
- **`data/auth.db` is per server**: it is not in the content snapshots, the
  R2 mirror or restores (so a restore cannot bring back a removed passkey, a
  spent code or a revoked session), but `scripts/deploy.sh` backs it up with
  the other databases. After moving to a new server, sign in with the
  password (`ADMIN_EMAIL` / `ADMIN_PASS` bootstrap) and register passkeys
  again. If `auth.db` itself is damaged, the admin fails closed: move it
  aside, restart, sign in with the password.

### Login brute-force defence (`lib/security/loginThrottle.ts`, `lib/security/loginGate.ts`)

Designed so that it caps guessing for the whole internet together, yet
cannot be turned into a lock-out weapon against the owner:

- **Per (email, client) lockout with exponential backoff** — 4 free
  mistakes; the 5th locks that email *for that client network* for 30 s,
  then 60 s, 2 min, … up to 1 h. History is forgotten after 24 h without a
  failure, and a successful login clears it. An attacker only ever locks
  out their own network; the owner signing in from anywhere else is
  unaffected. A locked pair is answered at once, without hashing.
- **Per-client limits** — 10 login attempts per 5 min (tightened to 4
  while the site is under a distributed attack) and 30 per hour, per IPv4
  address or IPv6 `/64`; IPv6 clients additionally share a `/48` budget of
  three times that, because one customer (or one free tunnel-broker
  account) gets a whole `/48` — 65,536 `/64`s.
- **Global throughput cap, never a global lockout** — once 30+ failures
  from all clients land within 15 min, the site is "under pressure" and
  every credential check from an unrecognised browser passes through one
  process-wide serial queue: a check starts only after the previous one
  finished and the slowdown delay (0.5 s per 30 recent failures, up to 4 s)
  has passed. At the maximum that is 15 guesses a minute for everyone
  combined, however many addresses are used. The queue is bounded (at most
  ~30 s of waiting, 32 entries); past that the request gets the generic
  `429` immediately. Outside an attack up to 8 checks run concurrently, and
  any burst beyond that is queued too.
- **Known devices** — a successful login also sets `cv_known_device`, a
  random device id signed with HMAC-SHA256 under `JWT_SECRET` (180 days,
  `httpOnly`, `SameSite=Strict`, `Secure` in production). A browser
  carrying a valid one skips the global queue, so the owner can sign in
  during an attack; it still obeys the per-(email, client) lockout and the
  per-client limits, and grants nothing else. Log out does not clear it
  (it identifies the browser, not a session); rotating `JWT_SECRET` forgets
  every device. Signing in from a new browser during an attack means
  waiting in the queue.
- **Event loop stays free** — login uses the asynchronous `crypto.scrypt`,
  so a flood of attempts cannot block other requests.
- **No account enumeration** — unknown emails go through the exact same
  path as wrong passwords: one scrypt hash, the same throttling state,
  the same `401 Invalid credentials`, and the same generic `429` message,
  which never confirms an address. Password-reset requests always answer
  `{ ok: true }` without waiting for SMTP, and at most 3 reset links can be
  outstanding at once (no inbox flooding).
- Throttle and queue state live in process memory and are bounded; a
  restart (which only the operator can trigger) clears them.

### Client IP (`lib/rateLimit.ts`, `lib/security/ip.ts`, `lib/security/proxyTrust.ts`)

- The client address comes from `TRUST_CLIENT_IP_HEADER` (default
  `cf-connecting-ip`, which Cloudflare overwrites at its edge), falling back
  to the TCP peer when the header is missing or malformed.
- The header is only believed when the TCP peer is a trusted proxy:
  `TRUSTED_PROXY_IPS` (IPs and CIDRs, IPv4 and IPv6) when set; otherwise
  loopback plus the container's default gateway, read once from
  `/proc/net/route` (Linux; elsewhere loopback only). In the standard
  deployment cloudflared runs on the host and reaches the container
  through Docker's `127.0.0.1:3002 → 3000` mapping, so its connections
  arrive from that gateway. Any other peer — a sibling container talking
  to the container's address directly, for instance — is rate-limited by
  its own socket address and cannot pick a fresh client IP per request.
  Every process on the host also connects from the gateway address: the
  host is inside the trust boundary.
- `x-forwarded-for` is read right-to-left, skipping trusted hops.
- IPv6 clients are rate-limited per `/64`, so one end-user network can't
  rotate through fresh addresses (login also per `/48`, see above).
- The edge `/api/og` route cannot see the TCP peer and uses the header as
  is; it only applies a coarse render limit (60/min).

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

- **Contact form** — signed single-use nonce (2 s minimum fill time),
  honeypot, per-client limit (5 per 10 min); header-injection-safe. Every
  message is kept in the admin Inbox (`data/contact-inbox.jsonl`) as well
  as emailed when SMTP is configured, within site-wide caps: at most 300
  messages stored per UTC day and nothing more once the log reaches 5 MB
  (a warning is logged once per day). Past a cap a message is still
  emailed when possible; when it can be neither emailed nor stored the form
  answers `503` ("try again later") — never a fake success. Inbox reads are
  bounded (only the newest ~6 MB of the log is parsed; other operations
  stream it in 64 KB chunks), so a large log cannot exhaust memory.
- **Inbox deletion and backups** — snapshots (`lib/backup.ts`) include the
  inbox log, so a deleted message remains in up to 20 local and 30 R2
  backups until they rotate out. Restoring merges the backup's log into the
  live one, but skips every id the owner deleted (the newest 5,000 deleted
  ids are remembered in `data/contact-inbox.state.json`), so a restore does
  not resurrect deleted messages. To erase a message from backups too,
  delete it and then let newer snapshots replace the old ones (or remove
  old tarballs).
- **`/api/og`** (Node runtime) — never renders free text without a valid
  signature: fixed pages use fixed cards by id (`?card=about`), article
  cards carry an HMAC-SHA256 signature over their canonical parameters
  (key derived from `JWT_SECRET` with HKDF, computed in the page loaders,
  checked in constant time), and anything else gets the generic default
  card (rendered once per size, cached one day instead of a year). Text is
  clamped by code point, the cover is a same-site upload only, per-IP render
  limit (60/min), `Cache-Control: public, max-age=86400, s-maxage=31536000,
  immutable` for real cards.
- **`/api/e`** (error reports) — browser error reports and CSP violation
  reports (`report-uri`, same origin). 8 KB bodies, per-client and
  per-network minute budgets, 500 fingerprints and 20 000 events a day at
  most; DNT / GPC, bots and cross-site posts are dropped. Query strings,
  e-mail and IP addresses, tokens and ID-like numbers are scrubbed before
  storage; no address, user agent, cookie or body is kept. Always `204`.
- **`/api/internal/restore-drill`** — loopback peers with the per-process
  in-memory token only (`lib/internalJobs.ts`); everyone else gets `404`.
- **`/api/health`** — anonymous callers get only `{"status": …}` (`200`, or
  `503` when the store is unreachable). The operational detail (backup
  times, R2 configuration, pending R2 writes, warnings, uptime) goes only to
  a signed-in admin or to `Authorization: Bearer <HEALTH_TOKEN>` when that
  variable is set (constant-time compare), so the public cannot read the
  last deploy or backup time off it.
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

Known CSP loosening (documented in `lib/csp.js`): `script-src` includes
`'unsafe-inline'` (Next/Chakra inline bootstrap and styles). It does **not**
include `'unsafe-eval'` in production (since 2.2.0): MDX articles are
compiled to a plain tree on the server and rendered without evaluating
code in the browser; only the development server adds `'unsafe-eval'`, for
Fast Refresh. Because of `'unsafe-inline'`, XSS defence still rests on
React escaping and on the link sanitiser (`lib/cvFormat.ts` `safeHref`)
rather than on the CSP.

### Container runtime (`Dockerfile`, `docker-compose.yml`)

The image runs as the non-root user `nextjs` (uid 1001) under `dumb-init`.
Compose drops every Linux capability (`cap_drop: [ALL]`), sets
`no-new-privileges`, and limits the container to 256 processes/threads.
The root file system is writable on purpose: ISR rewrites prerendered pages under
`/app/.next/server`, which a read-only image would have to move to a
volume re-seeded on every deploy.

### Backups and restore drills

Snapshot manifests record a SHA-256 per file, the row counts and the schema
version. A weekly restore drill (`lib/restoreDrill.ts`) opens the newest
backup — the R2 copy when configured — in a scratch folder and checks the
archive, checksums, SQLite integrity, migrations, row counts and an article
render; failures show in Admin → System and the `/api/health` detail.

## Operator responsibilities

This project ships secrets-free, but a deployment is only as safe as
its operator. After cloning:

1. Generate a real `JWT_SECRET`:
   ```bash
   node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
   ```
2. Set `ADMIN_EMAIL` + `ADMIN_PASS` in `.env`. They're consumed on
   first boot to populate `data/admin.json`, then can be cleared.
   To revoke every session without changing the password, use **Sign out
   everywhere** in Admin → Security.
   Then register a passkey on two devices (Admin → Security), store the
   recovery codes offline, and turn on **Require a passkey**.
3. **Never commit `.env`.** It's already in `.gitignore`; double-check
   before your first push.
4. Rotate `GITHUB_TOKEN`, R2 keys, Mongo URI through the providers'
   dashboards on any deploy, even if the same values "look fine".
   Cleartext credentials in `.env` should never be reused across
   personal and production deployments.
5. Behind a proxy other than a cloudflared on the Docker host, set
   `TRUST_CLIENT_IP_HEADER` and `TRUSTED_PROXY_IPS` so rate limits see
   real client addresses; see `.env.example`. With both blank, the header
   is believed only from loopback and the container's default gateway.
6. Set `R2_REQUIRED=1` in production so the container refuses to start
   without a working off-site mirror (default = warn only).
