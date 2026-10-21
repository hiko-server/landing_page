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
  `ADMIN_EMAIL` / `ADMIN_PASS` on first use — only while the file does not
  exist: one that exists but cannot be read or parsed is never overwritten,
  and until it is repaired (or removed, to bootstrap again) every admin
  session check fails closed and nobody can sign in.
- **Password hashing** — scrypt (`N=16384, r=8, p=1`, 64-byte key) with a
  random 16-byte salt; constant-time compare. The NFKC form of the password
  is hashed and checked (NIST SP 800-63B), marked `passwordNorm: 'NFKC'` in
  `data/admin.json`; a record from before that is checked as typed until its
  next change or reset.
- **Password change** (Admin → Security → Password,
  `POST /api/admin/security/password`, `lib/adminAuth/password.ts`) — needs
  the admin session and the current password, checked exactly like a
  sign-in (async scrypt, constant time, the same per-(e-mail, client)
  lockout) and answered only "incorrect" when wrong; failures are counted
  with the failed sign-ins. 10 attempts per 15 minutes per client. The new
  password (`lib/adminAuth/passwordPolicy.ts`, shared with the e-mail reset
  and the page's live checklist): 12–256 code points after NFKC, any
  characters, not built from very common password words, keyboard or
  alphabet runs, repeats or years (look-alikes such as `p@ssw0rd`
  included), not containing the e-mail's local part or the site's name, not
  the current password. A refused password costs no hash and no lockout
  attempt. One change at a time, compare-and-swap against the verified hash,
  fresh salt, atomic write, every reset link burnt. "Sign out other
  browsers" (on by default) bumps the session version and revokes every
  other session row (`password-changed`) and every pre-session token; in
  every case this browser gets a new session (row + cookie, verified now)
  and its old token ends. Recorded in the sign-in history
  (`password-changed`) and the activity log (no secrets); with SMTP, a
  notice (time, browser, country — no address — and what to do if it was
  not you) goes to `NOTIFY_EMAIL`, else the account address, and a mail
  failure never fails the change. The page says whether `ADMIN_PASS` in the
  environment still equals the password (computed server-side, never sent).
- **Session cookie** — `cv_admin_token`, an HS256 JWT (algorithm pinned on
  verify) valid for 7 days; `httpOnly`, `SameSite=Strict`, `Secure` in
  production, `path=/`.
- **Two-layer gate** — the proxy (`proxy.ts`, Next.js 16's proxy on the
  Node.js runtime) checks the session before every `/admin/*` page
  (guests → `307 /admin/login?next=…`) and `/api/admin/*` route (guests →
  JSON `401`): signature, expiry, role, session version and session row
  (`lib/adminAuth/proxyGate.ts`; read-only, fail-closed when `admin.json`
  exists but cannot be read or parsed, or `auth.db` cannot be read). Every
  API handler then calls `lib/auth.ts`,
  the authoritative check, which also refreshes the session's last-seen
  time.
- **Sessions** (`lib/adminAuth/sessions.ts`, `data/auth.db`, owner-only:
  the file, its `-wal` / `-shm` files and its pre-migration copies are
  `0600`) — every sign-in creates a session row; the JWT carries its id (`sid`) and is honoured only
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
  first page view swaps it for one bound to a new row. Such a token cannot
  be listed or revoked on its own, so the first time the owner signs any
  browser out (Log out, one browser, the other browsers) a cutoff is stored
  in `auth.db` and every `sid`-less token issued until then is refused;
  a week after `auth.db` was created none can be valid anyway. A revoked or
  signed-out token loads neither an admin page shell (the proxy sends it
  to the sign-in page) nor any admin API (`401`).
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
  post or case study, deleting an image from the media trash for good,
  MongoDB restore or target changes, every passkey,
  recovery-code, policy or other-browser change, and a password change
  while "Require a passkey" is on require a sign-in or a
  re-verification on this browser within `ADMIN_RECENT_AUTH_MINUTES`
  (default 10); otherwise the route answers `403 STEP_UP_REQUIRED` and the
  admin asks for a passkey or the password (+ code). A token from before
  sessions existed never counts as recent. A password change while the
  password may sign in asks for nothing more: its current-password field is
  that re-verification (asking twice would add nothing); with "Require a
  passkey" on, the password alone proves nothing, so the change needs the
  step-up as well.
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

### CSRF (`proxy.ts`, `lib/security/csrf.ts`)

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
- **`/api/e`** (error reports) — browser error reports and CSP / Trusted
  Types violation reports (the policies' `report-to` endpoint and
  `report-uri`, same origin). 8 KB browser error reports; report uploads
  up to 64 KB (the Reporting API batches a minute of reports), at most 20
  reports kept per upload with enforced violations first; per-client and
  per-network minute budgets. Browser reports may hold at most 300 of the
  500 fingerprints, add at most 30 new ones an hour (all senders together)
  and store 20 000 events a day, while server errors keep their own room
  and daily budget (a new one replaces the least valuable browser report
  when the table is full), so anonymous reports can never hide a server
  error. Report-only (Trusted Types) groups are sampled before those
  budgets: at most 50 events per group and 200 groups per UTC day, and
  only the sink name ("Element innerHTML") is kept, never the sample text.
  DNT / GPC, bots and cross-site posts are dropped. Query strings, e-mail
  and IP addresses, tokens and ID-like numbers are scrubbed before storage;
  chunk hashes are removed from script URLs so one problem keeps one group
  across deploys; no address, user agent, cookie or body is kept. Always
  `204`.
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

### HTTP headers (`proxy.ts`, `lib/csp.js`, `lib/securityHeaders.js`)

The proxy sets every header on every response it handles
(`lib/security/responseHeaders.ts`: all routes but the fingerprinted
`/_next/static/*` files and `/favicon.ico`, which get the
page-independent ones from `next.config.js`):

- `Strict-Transport-Security` (2 years, preload), `X-Frame-Options: DENY`,
  `X-Content-Type-Options: nosniff`, `Referrer-Policy:
  strict-origin-when-cross-origin`, `X-Permitted-Cross-Domain-Policies:
  none`.
- `Cross-Origin-Opener-Policy: same-origin` — no window handle across
  origins (external links open with `noopener`; there is no pop-up
  sign-in).
- `Cross-Origin-Resource-Policy: same-origin`, except what other sites may
  legitimately show: `/uploads/*`, `/images/*`, `/icons/*`, `/icon.svg`,
  `/favicon.ico` and the social cards (`/api/og`) are `cross-origin`.
  No `Cross-Origin-Embedder-Policy`: articles embed remote images and the
  video players, which do not opt in, and nothing here needs
  cross-origin isolation.
- `Permissions-Policy` — every powerful feature the site does not use is
  off for the page and every frame (camera, microphone, geolocation,
  payment, USB, serial, HID, Bluetooth, MIDI, sensors, screen capture,
  idle detection, local fonts, interest-based ad topics, …); passkeys
  (`publickey-credentials-get/create`) and the clipboard are `self`
  (the site only writes to it; the E2E suites read back what the copy
  buttons wrote); autoplay, encrypted media, full screen and picture-in-picture
  go to `self` and the three video-player origins only.
- Admin responses add `X-Robots-Tag: noindex, nofollow, noarchive` and
  `Cache-Control: no-store`.

**Content-Security-Policy** (enforced; `lib/csp.js` documents every
directive):

- `script-src 'self'` plus the SHA-256 of each inline script the pages
  render (the Trusted Types default policy, the theme and theme-colour
  pre-paint scripts, the tag filter's pre-paint) — no `'unsafe-inline'`
  and no scheme or host source. It does **not**
  include `'unsafe-eval'` in production either: articles are compiled to a
  tree on the server and rendered without evaluating code (only `next dev`
  adds it, for Fast Refresh).
  `lib/security/inlineScripts.ts` hashes the very constants the pages
  render, so a script and its hash cannot drift; a unit test fails when a
  page or component renders an inline script that is not listed, and when
  `'unsafe-inline'` or a scheme source reappears in `script-src`. Next's
  `__NEXT_DATA__` and the JSON-LD blocks are JSON data blocks, never
  executed. `script-src-attr 'none'`: inline event handlers never run.
- Why `'self'` and not nonces with `'strict-dynamic'`: static and ISR
  pages are one cached HTML file for every visitor and cannot carry a
  per-response nonce, and `'strict-dynamic'` would refuse Next's own
  `<script src>` tags. Nothing same-origin can be turned into a script:
  there is no JSONP endpoint, and uploads are images only, served with
  `nosniff` and a sandboxing CSP.
- `style-src 'self' 'unsafe-inline'` — Chakra UI renders through Emotion,
  which writes each page's styles into inline `<style>` elements on the
  server and inserts more at run time; next/font adds inline `@font-face`
  blocks and React renders `style` attributes. Their content differs per
  page and state, so hashes cannot list them, and static pages cannot
  carry nonces. CSS cannot run script.
- `img-src 'self' data: blob: https:` — a published article still embeds
  images from another host (checked against the live content store on
  2026-10-20: one post, four images on the project's own media host). The
  publish checklist offers to import remote images into `/uploads`; once
  none is left, `https:` can go. `media-src 'self'`, `font-src 'self'
  data:`, `connect-src 'self'`, `worker-src 'self'`, `manifest-src
  'self'`, `object-src 'none'`, `base-uri 'self'`, `form-action 'self'`,
  `frame-ancestors 'none'`, `frame-src` the three video-player origins
  only, `upgrade-insecure-requests`.
- Violations are reported to the site's own Errors panel (Admin → System
  → Errors): `report-to csp` with `Reporting-Endpoints: csp="/api/e"`
  (batched by the browser), and `report-uri /api/e` for browsers without
  the Reporting API. No third party receives them.

**Trusted Types, report-only** (`Content-Security-Policy-Report-Only:
require-trusted-types-for 'script'; trusted-types default nextjs
nextjs#bundler`): a plain string reaching a DOM-XSS sink (innerHTML,
script text or URL, `DOMParser` …) is reported and nothing is blocked. A
narrow default policy (`lib/trustedTypesDefault.ts`, the first inline
script) approves only what is safe by construction — HTML without `<`
(text cannot create elements), the same text between Cloudflare's
`email_off` comments, React's empty inert `<script>`, JSON as script text,
and this origin's `/_next/static/` chunk URLs — so the public pages report
nothing (an E2E test checks page loads, client-side navigations and the QR
panels; QR codes are drawn as SVG elements, not markup). What is still
reported is the work list before Trusted Types can be enforced: today the
admin rich-text editor (TipTap / ProseMirror) parsing the owner's own HTML
with `DOMParser` and `innerHTML`.

Not sent on purpose: `Clear-Site-Data` on logout. The session cookie is
already cleared by `Set-Cookie`, admin responses are `no-store` (nothing
to purge), `"cookies"` would also clear every cookie of the registrable
domain's other subdomains, and `"storage"` would delete the editors'
unsent drafts.

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
   Change the password later in Admin → Security → Password (it never
   reads `ADMIN_PASS`); the card says while `ADMIN_PASS` still equals the
   live password — remove it from `.env` once it has changed.
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
