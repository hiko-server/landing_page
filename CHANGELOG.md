# Changelog

All notable changes to this project will be documented in this file.

The format is loosely based on [Keep a Changelog](https://keepachangelog.com/),
and this project does not yet follow semver in earnest (single-deployment
portfolio CMS, no public package). Entries are grouped by release date.

## [Unreleased]

### media-library

The media library (wave 3: H7) — Admin → Media (`/admin/media`, `G` then `M`).

- **Every upload in one place**: a grid or a list (remembered in this
  browser) of the originals on this server and — after an R2 check — the
  ones only R2 holds, with their pixels, size, type, shape, responsive
  versions and R2 state. Search covers names, alt texts, captions and the
  titles of what uses them; filters for no alt text, unused, missing sizes,
  large files (≥ 500 KB), not in R2, type and shape, and sorting all live in
  the address (`?q=…&filter=unused&sort=largest`). Keyboard: `/` searches,
  arrows move by rows and columns, Enter opens, X selects, Escape clears;
  Shift-click selects a range.
- **Where each image is used** — a usage index (content migration 3) of
  every `/uploads/…` reference (variants count for their original) in posts
  and case studies, drafts and unpublished changes included, `/now`,
  `/uses`, the `/about` bio, the home page (hidden photos too), the CV (the
  PDF-only photo) and other stored documents, with the editor and page
  links and whether each place has an alt text. It is rebuilt whenever the
  stored content changed (a fingerprint of every row), so saves, restores,
  renames, imports and the boot sync all count.
- **Default alt text and caption**, in English and 中文, per upload (the kv
  row `media-library`, mirrored to R2 like home and the CV; ⌘S; a save from
  a stale form gets *changed in another tab* with *Use theirs / Keep mine*).
  The editor's new **image picker** — toolbar, `/library`, *Insert from
  library…* in the MDX tab, and *Library…* on cover fields — offers them in
  the page's language (never the other one), lets them be edited for that
  place and optionally kept as the defaults, and inserts
  `![alt](/uploads/… "caption")`. *Use the default alt text there* fills in
  every post, case study and page that shows the image without an alt text
  (or with a file name), English pages in English and Chinese ones in
  Chinese, each snapshotted first. Content health links an upload's image
  issues to the library, and the content export gains `image-texts.json`.
- **Replace file**: uploads are served `immutable` for a year, so the new
  file gets a new name through the upload pipeline (sizes, AVIF, blur
  placeholder, R2) and every reference follows — posts, case studies (live
  and unpublished), pages, the home page and the CV, snapshotted first —
  with its texts. The old address answers 308 to the new file (a variant to
  the new file's variant of the same width; chains collapse) and the old
  file waits in the trash; the pages that show it are regenerated.
- **Safe delete into a 30-day trash**: refused while anything uses the
  image (re-checked from the store at that moment). Deleting moves the
  original and its variants to `data/media-trash/`, deletes its R2 copies
  (an upload only R2 holds is kept in the trash first), purges its URLs from
  the Cloudflare cache and offers *Undo*. The trash view restores (files,
  address, texts and R2 copies) or deletes for good; a nightly purge empties
  what is older than 30 days. A trashed name is never served from R2, never
  pulled back by the boot sync (which also removes R2 copies a failed
  delete left behind and now repairs pending `uploads/` keys instead of
  dropping them) and never taken by a new upload.
- **Bulk actions and uploads**: *Generate responsive versions*, *Copy to R2*
  and *Move to trash* on a selection; upload by button or by dropping images
  anywhere on the page (or in the picker), one at a time through the
  editors' pipeline, with a queue that waits out a busy server or the upload
  limit by itself (429 on uploads now carries `Retry-After`).
- **R2 index**: *Check now* (and a quiet check when the last one is over six
  hours old) lists `uploads/` in R2; the drawer offers *Copy to R2* for an
  image R2 lacks and *Download to this server* for one only R2 holds.
- The admin overview card counts images, missing alt texts and unused
  ones, and *needs attention* lists images without alt text. Every change
  is in the activity log (*Images*).
- **Content migration 3 (`media-library`)**: `media_assets`, `media_usage`,
  `media_trash`, `media_redirects`, `media_index_state` (expand-only; an
  older image keeps working on a v3 store).
- Tests: `tests/media-library-usage.test.ts`,
  `tests/media-library-store.test.ts`, `tests/media-library-sync.test.ts`,
  `e2e/media-library.spec.ts`.

### admin-editorial

Editorial tools in the post and case-study editors (wave 2B: H1, H3, H4, H6, H16).

- **Unpublished changes on live items** (H4): saving a published post or case
  study (⌘S, "Save changes") stores the edits as unpublished changes — the
  public page, feeds and sitemap keep the published version. A banner says so,
  with **Preview ↗** (Draft Mode renders the changes at the real address, with
  a bar that says what it shows), **Discard…** and **Review & publish…**: a
  diff against the live version, the publish checklist and — for posts — "Mark
  as updated today". The list pages mark items with changes not live. Drafts
  and new items save as before. Restoring a history version replaces the
  changes too, after keeping them in the history.
- **Change a slug** (H6): "Change…" next to the slug of an existing item. A dry
  run lists every post, case study, page, CV entry and home-page link to the
  old address; the change rewrites them (never inside code), moves the item's
  history and unpublished changes, and keeps the old address working with a
  permanent (308) redirect answered by getStaticProps (the edge middleware
  cannot read the store). Chains collapse to one hop, a live item always wins
  over a redirect, and each old address can stop redirecting. The old and new
  pages, feeds and sitemap refresh.
- **Search & sharing** (H1): search title (measured against Google's ~600 px
  cut), description length guidance, language, "Mark as updated" and the card
  alt text, with live previews of the Google result and the LinkedIn, X,
  WhatsApp and Slack cards — the real signed `/api/og` card for the unsaved
  state (admin endpoint, 800 ms debounce, loaded only while open). WeChat is
  shown as it really looks without its JS-SDK: the title and a generic link
  icon. Posts gain a cover alt text field; `og:image:alt` describes the cover
  when the card shows it.
- **Writing environment** (H3): word and character counts (Chinese, Japanese
  and Korean per character) and the page's reading time, find & replace (⌘F /
  Ctrl+F inside the editor; case, whole word and regex with `$1` groups; one
  undo step), focus mode (other blocks dim to the AA "subtle" colour),
  typewriter scrolling and a line saying where the words are (this device,
  draft, not live yet, live).
- **Tags & export** (H16, `/admin/tags`): every post tag and case-study tech
  entry with its usage and spellings; rename, unify spellings or merge across
  all items (a history snapshot per item, unpublished changes follow); and a
  one-click **.zip export** of all posts, case studies and pages as MDX with
  YAML frontmatter, unpublished changes, the CV and home JSON, the redirects
  and a list of every image used.
- **Content migration 2 (`editorial`)**: adds the `pending_revisions` and
  `redirects` tables (expand-only; applies cleanly on a v1 store, an older
  image keeps working on v2).
- `lib/editorialEvents` lets the admin audit log hear renames, publishes of
  changes, discards, redirect removals, tag changes and exports.
- Fixed: admin title-bar actions wrap on phones instead of widening the page;
  an open collapsible panel with a long unbreakable line no longer widens the
  page; the editor's ⌘⇧P hint meets AA contrast.

### security-b

Strict CSP and the Next.js 16 proxy.

- **Scripts by hash only**: the Content-Security-Policy no longer allows
  `'unsafe-inline'` scripts. `script-src` lists this origin and the SHA-256 of
  the four inline scripts the pages render, computed from the same constants
  the pages print (`lib/security/inlineScripts.ts`), so a script and its hash
  cannot drift; inline event handlers never run (`script-src-attr 'none'`).
  The real HTML of every page type (public, admin, 404, 500, Draft Mode) was
  checked, and a real browser found nothing blocked on any public or admin page,
  the rich-text editor, the PDF and QR features, the theme pre-paint, the
  analytics beacon or view transitions included. Unit tests fail if
  `'unsafe-inline'` or a scheme source comes back.
- Tighter sources: no `https:` in styles or fonts, media and workers from
  this origin only. Images keep `https:` while a published article still
  embeds remote images (documented in `lib/csp.js` and SECURITY.md).
- **Violation reports** go to the site's own Errors panel through both the
  Reporting API (`report-to`, `Reporting-Endpoints`) and `report-uri`;
  `/api/e` accepts the browser's batched uploads (up to 64 KB, enforced
  violations first) and still stores no address or user agent.
- **Trusted Types, report-only**, with a narrow default policy that approves
  only what is safe by construction (text without markup, JSON, this build's
  own chunk URLs), so public pages report nothing and the panel lists only
  real work: today the admin editor's HTML parsing. Reports keep the sink
  name, never the sample text, and are sampled (50 a group a day). QR codes
  are drawn as SVG elements instead of injected markup.
- **More headers**: `Cross-Origin-Opener-Policy: same-origin`,
  `Cross-Origin-Resource-Policy` (same-origin; images and icons other sites
  may show stay cross-origin), a complete `Permissions-Policy` (every powerful
  feature the site does not use is off; passkeys, the clipboard and the video
  players keep what they need) and `X-Permitted-Cross-Domain-Policies: none`.
- **`middleware.ts` → `proxy.ts`** (Next.js 16's proxy, Node.js runtime):
  redirects, the IndexNow rewrite, CSRF, headers and the admin gate behave as
  before, and the gate now also checks revocation — a browser that was signed
  out (or every browser, after "Sign out everywhere" or a password reset) can
  no longer load an admin page shell with its old cookie. The Edge-runtime
  build warning and the webpack hook that hid it are gone; the gate's check
  costs about 0.1 ms per admin request, and public routes are as fast as
  before.

### search-ask

Chinese and natural-language site search (F4), and "Ask Lucian" — answers
quoted from the site itself (J1).

- **Search reads Chinese.** The search index now carries the Chinese CV
  (`/cv/zh#…` anchors) next to the English one. Words are matched the way
  Pagefind does for CJK: overlapping character pairs in the text, dictionary
  words (Intl.Segmenter) in the query, Chinese particles and question words
  dropped — so 实习, 香港 and 专利 find their entries. Of an entry found in
  both languages, the one in the query's language is shown.
- **Questions search their meaning.** Question and function words and the
  owner's own names are dropped ("Does Lucian have patents?" searches
  *patents*), known phrases stay whole ("open to work", "machine learning",
  编程语言), and a vocabulary of common recruiter terms links English and
  Chinese (internship ↔ 实习, patent ↔ 专利, award ↔ 奖项 …) and asks for
  the right CV section ("Has he won awards?" → Competitions & Awards).
  Results show a snippet with every matched word marked, in the palette and
  on the 404 page's *Did you mean*, which now also offers pages whose
  content matches the address (/实习 → the internships).
- **Ask Lucian / 问问 Lucian.** The ⌘K palette has a Search / Ask switch (and
  an "Ask: …" first row when a search reads like a question); /about and
  /contact open it in Ask mode. A question in English or Chinese is answered
  **only with passages quoted from the site** — CV lines and facts, post and
  page paragraphs, recommendations given with permission, the availability —
  grouped by source as numbered citation chips, the matched words marked.
  Every quote links to its page with a text fragment (`#:~:text=…`), so the
  browser scrolls to it and highlights it; on the page it cites, the quote
  is found and marked in place. It runs entirely in the browser (BM25 over a
  passage index; no LLM, no request, no cost) and never invents: with no
  matching passage it says so and offers "Ask Lucian directly", which puts
  the question into the contact form's message (never into a URL). The
  answer reveals source by source with a soft sweep (instantly under reduced
  motion), is announced politely to screen readers, is fully keyboard
  driven (↑ ↓ ↵, Backspace back to Search) and works in both themes and on
  phones. Suggested questions are shown only when the site answers them.
- **The passage index is public data only** and is built like an ISR page:
  once per content version, from the same readers the pages use (the CV
  audience with hidden fields, entries, bullets and sections removed, the
  hidden summary, recommendations without consent, drafts and contact
  details never included), shipped inside `/api/search-index` (v2). Every
  content and CV save marks it stale (`lib/revalidate.ts`) and purges it at
  the edge together with the CV pages, /contact and /publications; a
  ten-minute time-based rebuild is the fallback. The leak tests cover the
  search documents and the passages (`tests/search-ask-leak.test.ts`,
  `tests/search-ask-store-leak.test.ts`).
- **Publications** — paper documents (`lib/publicationsSearch.ts`) now carry
  the `publication` kind (they used the CV's): the palette and the 404 page
  label them *Paper*, questions about papers find them, and the Ask index
  quotes their abstracts. The 404 page still treats them as anchors inside
  /publications, as it does CV entries.
- **With the palette's nested pages (motion, C5)**: Ask is a view of the
  top level — Theme ›, CV ›, Contact › and Keyboard shortcuts › belong to
  Search; opening in Ask mode (the entries on /about and /contact) lands
  there directly, Backspace in an empty question returns to Search and
  Escape closes. The "Ask: …" row is offered at the top level only, first
  for a query phrased as a question (a question word or mark, 他有…吗) and
  after the results otherwise — Enter on a typed title still opens the
  title's page.
- **`onEmptyResult(query, mode)`** (`lib/search/emptyResult.ts`) is the one
  place a search or question that found nothing is reported, once per
  settled query: the query is normalised and capped at 40 characters, and
  one with an e-mail address or a long number is dropped. It dispatches the
  `site:search-empty` window event for the analytics client.
- The cited-quote highlight uses the accent tint in both themes
  (`::target-text`, `::highlight(cited-quote)`).

### admin-ops

Admin operations (wave 2B: H8, H9, H11, H13, H14, CORR-3).

- **Content health center (H8)** — Admin → System → Content (and a card on
  Health): broken, moved and unverifiable links (a daily, polite external
  link check through `safeFetch`: HEAD first, one request per site at a time,
  2 s apart, 400 links per run, `LINK_CHECK_INTERVAL_HOURS`; LinkedIn's 999
  and bot walls are "couldn't verify"), links to missing or draft posts,
  tracking parameters, missing / hot-linked / heavy / oversized images,
  uploads without responsive sizes, file-name alt text, heading structure,
  duplicate or missing descriptions and hard breaks — across published posts,
  case studies, pages, the CV and the home page. One-click safe fixes (strip
  tracking parameters, import a remote image, generate sizes, follow a
  permanent redirect, remove a stray break; "Apply all safe fixes") save
  through the editors' own path with a version check (409 when the item
  changed); `j` / `k`, `Enter`, `f` on the list. The media optimiser moved to
  `lib/mediaOptimize.ts`; `safeFetch` can report redirects hop by hop and
  truncate a body instead of failing.
- **Goals and recruiter signals (H9)** — cookieless goal events from an
  allow-list of eight, each with at most one bounded property: CV download
  (counted on the server, 304 revalidations included) and print, vCard save
  (server; `/api/vcard` now revalidates at the origin), e-mail and outbound
  link clicks (the page path / destination host only), contact sent
  (server, the inquiry kind only), article read-through and the critic's
  `search_empty` (normalised ⌘K query ≤ 40 characters, dropped with `@` or
  six or more digits, kept 35 days). Same exclusions, daily-salted hash and
  budgets as page views; analytics migrations 5 (vitals attribution, shared
  with the perf stream) and 6 (events). Admin → Analytics gains **Goals**
  (visitor-days, conversion rate, trend), a **Source → CV → Download**
  conversion over the raw 35-day window and **Searches with no results**;
  `/colophon` describes all of it.
- **Inbox 2.0 (H11)** — folders (Inbox / Starred / Archived / All), the
  inquiry kind from the structured fields, search across every field with
  `is:unread` / `is:replied` / `kind:role` operators, star, archive, read and
  replied, one message or a selection. **Reply by e-mail from the admin**:
  threaded with the notification you received (Message-ID, In-Reply-To,
  References), English / 中文 templates (`{firstName}` `{name}` `{subject}`
  `{me}`; stored in the content store, so backups carry them) with the
  original quoted, an optional Bcc to you. A reply is sent **from the SMTP
  account's own address** (`REPLY_FROM_EMAIL` to override) with **Reply-To**
  your public address, so a domain with DMARC `p=reject` can no longer get
  it refused; the start-up log and the dashboard's test e-mail warn when a
  From domain's policy would reject the mail. Without SMTP the composer
  explains the setup and opens the same draft in your mail app, then "Mark
  as replied". **Delete takes effect at once with Undo** (the request goes
  out when the toast closes, or with `keepalive` when the page is left).
- **Unified toasts (H11)** — one timing policy everywhere: successes stay
  ≥ 4 s, notes ≥ 5 s, warnings ≥ 8 s, errors until dismissed (announced as
  alerts); every toast has a close button and pauses while hovered, focused
  or the tab is hidden.
- **Activity log (H13)** — Admin → System → Activity, every successful admin
  write with who / what / when in `data/audit.db` (its own migrations), plus
  sign-ins and password resets from the sign-in history; word-level diffs
  (Chinese segmented) in the version history. Other routes can record their
  writes with `recordAdminAudit()` (`lib/audit/record.ts`); a unit test fails
  when a route that writes is neither described nor listed as public.
- **Keyboard-first admin (H14)** — ⌘K lists every admin destination (with
  its `G` key) and the actions of the view on screen (the Inbox registers
  reply / archive / star / delete …, the dashboard "Send a test e-mail");
  `G` then a letter jumps across the admin (`I` Inbox, `R` CV Studio, `S`
  System, `L` activity, `Q` content health, …; the public `G` keys keep
  working); `j` / `k`, `Enter`, `x` in the Inbox, Activity, posts / case
  studies and Errors lists; the `?` sheet is searchable. Every single-letter
  key follows the *Single-key shortcuts* switch and never fires in a text
  field or during IME composition.
- **CORR-3** — a job link with Chinese characters (normalising percent-encodes
  each one into nine characters) is no longer dropped from the stored Inbox
  message: the stored form allows 2 048 characters, and a link that would
  not fit is refused up front with "This link is too long — paste a shorter
  link to the same page." (the form and the API share `checkRoleUrl`).

### perf

Performance, measured (wave 2B: G3, G4, C8, G5, G6, G7 and cross-engine /
visual gates).

- **Less JavaScript on every page (G5)** — shared first-load JS 203.8 →
  166.9 KiB gzip (`pages/_app` 115.3 → 78.2), home 251.6 → 215.9, case
  studies 259.1 → 208.1, articles 257.3 → 206.1, /about 246.3 → 210.2 KiB.
  framer-motion renders through `m` with its animation features in their own
  chunk; the theme carries only the Chakra component styles public pages
  use (the admin's load with the admin); the toast host, the image viewer,
  the back-to-top button, the reading-progress bar and web-vitals load on
  demand. The performance budget now also holds `_app` (≤ 80 KiB) and the
  home page to budgets of their own.
- **Half the font download (G3)** — each Geist face is a Latin core plus an
  extension (Latin Extended, Vietnamese, Greek, Cyrillic, symbols) under one
  family, split by `unicode-range`: the two preloaded files drop from 137.7
  to 68.4 KiB and English pages never fetch the extension. No glyph, weight
  or OpenType feature is lost; Chinese still uses the system fonts
  (`scripts/subset-fonts.mjs`).
- **AVIF and small image sizes (G4)** — uploads get WebP and AVIF at 320 /
  480 / 640 / 1280 / 1920 px and at their own width, made at upload (or by
  *Generate responsive versions* in the Writing / Work admin lists for older
  uploads), never while a page renders. Article
  images, covers, the home portrait and field notes, the /about portrait,
  the author card, video posters and the lightbox serve AVIF through
  `<picture>`; a 763 KB screenshot now reaches readers as a 21 KB AVIF. The
  owner's field-note photos (server-local, never in the repository) are
  baked the same way by the Docker build (`scripts/bake-images.mjs`).
- **Blur-up placeholders (C8)** — every upload also gets a 16 px
  placeholder, shown blurred in the image's box from the first paint (no
  JavaScript, no layout shift); a still-loading image fades in over it, a
  cached one appears at once, and nothing fades under reduced motion.
- **Where Web Vitals come from (G6)** — Admin → Analytics → Web Vitals shows,
  per page, the elements behind LCP, INP and CLS with their phases (server
  response, load delay, load time, render delay; input delay, processing,
  presentation). Elements are named by the site's own markup (tag, id,
  classes, at most 120 characters, never text); nothing identifies a visitor.
- **Gates on realistic content (G7)** — a synthetic fixture store
  (*Example Person*, generated images, never the live content) is built and
  served in the pinned Playwright image by `scripts/check-fixture-gates.sh`: CLS ≤ 0.05 and TBT ≤ 200 ms on a calibrated mid-range-phone
  profile (LCP reported), no horizontal scroll at 375 / 768 / 1440 px, no
  image over 200 KB or decoded far larger than shown, axe on the article.
- **Safari and Firefox, visual baselines** — the public checks also run
  on WebKit (iPhone) and Firefox, and 30 screenshots (home, article, case
  study, CV, contact × light / dark × phone / tablet / desktop) of the
  fixture store are compared pixel by pixel in the pinned Playwright image.

### security-a

Security and reliability foundation.

- **Passkeys for the admin** (WebAuthn): sign in with Face ID, Touch ID,
  Windows Hello, a phone or a security key — from the button or straight from
  the e-mail field's autofill. Ten one-time recovery codes (stored as hashes
  only), and an optional **Require a passkey** policy under which the password
  alone no longer signs in. The password still works as a fallback.
- **Sessions and history**: every signed-in browser is listed in the new
  Admin → Security page and can be signed out on its own; **Log out now signs
  out this browser only** ("Sign out everywhere" is on the Security page). A
  sign-in history records sign-ins, failures (time, method, country and a
  reason code; no address or device) and security changes.
- **Step-up**: restoring a backup, deleting a post or case study, MongoDB
  restore or target changes and every passkey / recovery-code / session change
  ask "Confirm it's you" (passkey, or password) when the last sign-in or check
  is older than `ADMIN_RECENT_AUTH_MINUTES` (default 10).
- **Error monitoring without third parties**: browser errors, unhandled
  rejections, error-boundary catches, CSP violations and server errors are
  grouped by cause in Admin → System → Errors — scrubbed of query strings,
  e-mail and IP addresses and anything ID-like, with no visitor identifier;
  nothing is sent under Do Not Track / Global Privacy Control. /colophon
  describes it.
- **System health** (Admin → System): deployed build, uptime, memory, free
  disk, each database's size and schema version, backups, restore drills and
  the recent warnings.
- **Restore drills**: every week (`RESTORE_DRILL_INTERVAL_HOURS`) the newest
  backup — the R2 copy when configured — is restored into a scratch folder and
  checked (checksums, SQLite integrity, migrations, row counts, an article
  render); a failure is flagged in the admin and in `/api/health`. Snapshot
  manifests now record a SHA-256 per file and the row counts.
- **Versioned SQLite migrations** (`scripts/db`, `yarn db:status`,
  `yarn db:migrate`): ordered, transactional, idempotent, shared by the app
  and the boot scripts, run at start, with a copy taken before a versioned
  store changes. Existing stores adopt the baseline unchanged.
- **Social cards** (`/api/og`) run on the Node.js runtime (no more Edge
  deprecation notice) and never render free text without a signature: fixed
  pages use fixed cards by id, articles use HMAC-signed parameters computed
  on the server; anything else gets the default card.
- **Container hardening**: no Linux capabilities, `no-new-privileges` and a
  PID limit in `docker-compose.yml`, asserted and exercised by
  `scripts/check-container.sh`.
- Admin primary buttons, eyebrows and section numbers use the contrast-safe
  indigo shades (accent.500 on white was 4.47:1).

### tokens-theme

Design-system foundation (research items B1–B4).

- **Design tokens (B1)** — `theme/tokens.ts` holds a fluid type scale
  (clamp between 360 and 1280 px viewports; labels never below 11 px, the
  page title 36–56 px), named text styles, letter-spacings, semantic radii,
  container widths and motion: one standard ease, three durations
  (150 / 250 / 450 ms) and zero under `prefers-reduced-motion`. The CSS custom
  properties in `styles/globals.css` mirror them (checked by tests).
  `PageGrid` lays a page out on named `content` / `wide` / `full` lines
  (`/work` uses it). Migrated: section labels, page headers, the article meta
  grid, the GitHub stats figures and labels, article headings and the work
  cards; an ESLint error guards the migrated components against raw type
  values, `cubic-bezier` literals and inline ease arrays (CONTRIBUTING.md).
- **Theme preference (B2)** — System / Light / Dark. The header toggle stays
  one tap with the circular reveal; the button beside it (or a right-click /
  Android long-press on the toggle) opens a keyboard-accessible menu, and ⌘K
  offers the same three actions. Dark stays the default
  (`NEXT_PUBLIC_DEFAULT_THEME` changes it at build time). An inline script
  applies the preference before the first paint — no flash, no hydration
  mismatch, nothing stored until the visitor chooses; System follows the OS
  live, and a choice made in another tab applies everywhere. A light choice
  made before this release is kept.
- **Colour tokens (B2)** — `status.live`, `status.featured` and
  `status.warning` (AA on every page background, overlays included) and three
  elevation shadows per mode (`boxShadow="elevation.sm | md | lg"`; dark adds
  a faint hairline). Toasts, the palette and work cards use them; the unused
  legacy `brand.*` / `ink.*` colour scales are gone.
- **Icons (B3)** — one Lucide outline icon set on public pages (inlined SVG,
  sized 12 / 16 / 20 / 24 px), replacing the glyphs Geist lacks (▾ ▸ ★ ✓) and
  the Font Awesome / Octicons / Chakra icons; the contact panel uses the inline
  brand marks. react-icons stays in the admin, and lint keeps it out of public
  code. Licence on `/colophon` (`/licenses/lucide.txt`).
- **Affiliation logos (B4)** — measured when the home page is saved (content
  box, aspect ratio, ink density; site files, uploads and remote images through
  `safeFetch`) and sized by area with a gentle density correction, cropped to
  their content; the owner's logo scale still multiplies the result. Phones get
  balanced rows of 3 or 2 (never a lone logo). A white logo backdrop no longer
  shows as a box in dark mode. The Home editor previews the strip with each
  logo's measured size, and its logo cards no longer crop the image.
- **Bundles** — public pages load less JavaScript (home 250.5 → 243 KiB,
  /about 244.5 → 234 KiB): the brand-icon module and the icon packs left the
  shared and home bundles. Shared first-load JS is 203.5 KiB (was 203.2): the
  preference store, the OS / tab sync and the menu button; the theme menu
  itself loads on demand, and the pre-paint scripts stay in the document.

### chrome-identity

- **Brand mark (A3)**: one typographic "LY" monogram replaces the emoji
  favicon and the selfie app icon — an SVG favicon that follows the
  browser's light / dark scheme, an ICO fallback, 192 / 512 px app icons, a
  512 px maskable icon (letters inside the safe zone) and the 180 px Apple
  icon, all rendered from one geometry (`lib/brandMark.ts`,
  `node scripts/build-icons.mjs`). The footer shows the same mark.
- **Hero (A3)**: the photo, scrim and grain now dissolve into the page over
  the hero's last 160 px instead of ending at a visible band in light mode,
  and the hero's dot grid lines up with the page's grid below it. In dark
  mode the white-background portrait is matted (an inner ring, a soft
  vignette, a slight exposure cut) instead of reading as a bright square.
- **Manifest (G8)**: named "Li Yanpei (Lucian)", shortcuts to the CV, the
  Chinese CV, Writing and Contact, `launch_handler`; the new icons. No
  service worker.
- **Footer (A5)**: three columns — the site, this site (colophon, privacy,
  the feeds, the source) and elsewhere — then the copyright, a "Built with
  Next.js · Set in Geist" credit and the deployed commit
  (`NEXT_PUBLIC_BUILD_SHA`, linked to the repository; local builds show
  none). Every list is a column, so "Contact" is no longer stranded on its
  own row on phones; the last line clears the scroll-to-top button.
- **Mobile menu (A5, C4)**: large numbered links with the current page
  marked, quick actions (Search, CV as PDF, 中文简历), and a Light / Dark
  segmented control whose icons and labels agree (it was a moon next to
  "Light mode"). The menu is a physical sheet: it follows a horizontal
  drag, closes when released past 35 % of its width or flicked faster than
  500 px/s, otherwise settles back, and the scrim lightens as it leaves;
  links rise in on open. Under reduced motion it opens and closes at once.
  Focus trap, Escape, focus return and the route-transition layer lifting
  are unchanged; a drag never follows the link it started on.
- **Keyboard hints (A5)**: on touch-first devices (`pointer: coarse`) the
  header and the ⌘K palette show no key chips or shortcut cheatsheet; the
  palette key reads ⌘K on Apple platforms and Ctrl K elsewhere.
- **/colophon (B5)**: the release history is a timeline — version, date and
  summary for every release, full notes only for the latest; the others
  open on demand or from their anchor.
- **/now (B5)**: beside the owner's own text, the live signals leave out
  whatever the text already links to or names, and the page shows one
  "Updated" date (the newest of the owner's date and the shown signals')
  instead of two conflicting ones.
- **404 (B5)**: laid out like every other page, with Home, a search field
  that opens the palette on the missing address's words, and up to four
  "Did you mean" pages ranked in the browser from the search index (typos,
  transpositions, a slug under another section, synonyms); still a real
  404, and the address is never sent or logged.
- **EmptyState (B5)**: one component for empty and unavailable states —
  /blog, /work, /now and the GitHub widgets.
- Shared JavaScript does not grow (203.2 → 203.0 kB gzip): the palette's
  "Edit this page" helper and the admin's error fallback moved out of the
  shared bundle, and the menu's gesture uses pointer events instead of
  framer-motion's drag.

### home-about-isr

Home and About: what a recruiter scans first, a lighter home page, a
narrative /about, both served from the ISR cache.

- **Owner-ordered home sections (A1).** Admin → Home → *Sections* lists the
  numbered sections as a sortable list (drag, touch or Space + arrows) with a
  visibility checkbox each, plus a one-click *Recruiter-first* preset
  (projects, experience, writing and skills before the GitHub activity) and
  *Default order*. Stored as `home.sectionOrder`; an older document without
  it, or with a section it did not know, is completed on read and on write
  so nothing disappears.
- **Proof strip (A1).** Up to four owner-written highlights under the hero,
  each a link to its source (CV entry, case study, external page). The
  editor suggests tiles built verbatim from the public CV's awards, patents
  and education with their `/cv#…` anchors; nothing shows until the owner
  saves one. A headline that is a whole number rolls up like the GitHub
  stats (off under reduced motion).
- **Compact Open Source band (A2).** Stats, then the contribution calendar
  beside one stacked bar of the top five languages plus *Other* (with a text
  legend), then the three pinned repositories. The calendar is one SVG path
  per contribution level with a screen-reader summary (total, active days,
  busiest day and month, longest streak) instead of 367 focusable cells,
  and a per-day tooltip for pointers. The page props carry only what is
  drawn: 3.5 KB of GitHub data instead of 19.8 KB on the production data (a
  compact one-count-per-day calendar, three repository cards, the language
  stack), and the calendar's markup shrinks from ~71 KB of cells to ~8 KB.
- **Contact on the home page (A2)** is the availability card (only when set)
  and a *Write to me* link to /contact, replacing the 760 px form and its
  human-check request on every home visit. The contact copy in the Home
  editor now belongs to the /contact form, and hiding the home band no
  longer resets it.
- **/about (A4).** A sticky identity rail on large screens (portrait,
  names, availability, *View CV* / *Download PDF*, profiles and a section
  nav that marks the current section), the tagline and focus areas, the
  owner's bio, and every CV section open with each toggle inside an h3. The
  bio is a new owner-editable MDX page (Admin → *About bio*,
  `/admin/about`): version history, drafts, compile checks, search index,
  sitemap date, backups; while it is empty the section is omitted (never
  the hidden CV introduction). The GitHub widgets and the experience
  timeline moved to the home page only: home = summary, about = narrative,
  CV = record.
- **ISR for / and /about (G1).** Both pages are statically regenerated:
  right after every save that changes them (home document, CV, the bio,
  posts → /, case studies → / and /about, restores, storage pulls, Mongo
  restores, image backfills) and at most an hour after the previous render,
  because "Present" / "Expected" and GitHub data change without a save.
  The build renders a 1-second placeholder (no content store, no GitHub
  calls) that the boot warm-up replaces. `expireTime` is a day, so a CDN
  serves a stale copy for at most 24 h. Two saves in quick succession no
  longer leave the older render cached: a revalidation never joins a render
  that started before it (Next batches concurrent ones), it waits and
  renders again.
- **Back/forward cache (FIX-22).** / and /about are restored instantly on
  Back (no `no-store` documents any more); `/api/contact/nonce` answers
  `private, no-cache, max-age=0` instead of `no-store`, and the contact form
  replaces a challenge older than five minutes when the page comes back from
  the cache. A Chromium e2e check (DevTools `backForwardCacheNotUsed`) guards
  both pages.
- Page JS: /about 244.3 → 235.7 KiB (the GitHub widgets and Chakra's
  Accordion left it), / unchanged at 250.5 KiB with the new features (the
  home page imports the read-side helpers of the home document only,
  `lib/homeSections.ts`, not the admin's validation), shared JS unchanged.

### reading-work

Writing and case studies (D1–D5, D7, D8, E8).

- **Videos (D3)**: a YouTube or Vimeo link alone in its paragraph becomes a
  click-to-load player (`<YouTube>` too). Its poster is imported once into
  `/uploads` through `safeFetch` — when the article is saved, or in the
  background the first time the running server compiles it — so a page
  never requests `i.ytimg.com` or `vimeocdn.com` before the reader presses
  play. Vimeo plays with `dnt=1`; start times are kept; the caption names
  the player host and links to the video; feeds keep plain links;
  `/colophon` discloses it. The editor's *Video* command takes both.
- **Callouts, footnotes, wide figures (D4)**: `> [!NOTE]` / `TIP` /
  `IMPORTANT` / `WARNING` / `CAUTION` quotes are callouts labelled in the
  article's language (备注 / 提示 / 重要 / 警告 / 注意) and survive the visual
  editor; footnotes get mono bracketed references and a highlight on the
  note jumped to; `<details>` reads as a deep-dive disclosure;
  `#wide` / `#full` on an image (or `<Figure size>`, or the image bubble)
  lets it break out of the text column, edge to edge on phones.
- **Galleries (D5)**: consecutive images form a gallery laid out by aspect
  ratio — landscapes alone, portraits in pairs, never a lone orphan — with
  no layout shift; identical captions are shown once; the lightbox keeps
  every caption; feeds get a flat list. Tall screenshots are capped at 70%
  of the viewport.
- **At a glance (D1)**: case studies can carry a one-line outcome, up to four
  metrics (value, unit, what was measured, source and evidence link), team,
  publication date and extra links, edited in a new *At a glance* fieldset;
  the page shows only what is filled in (and JSON-LD gets `abstract` /
  `datePublished`), the first metric appears on the `/work` card, and the
  publish checklist asks for a summary and a source per metric. New case
  studies offer a documented template whose notes are MDX comments that
  never reach the page; the checklist flags notes left behind and empty
  sections; the slash menu adds *Case-study outline* and Note / Tip /
  Warning callouts.
- **Covers and cards (D2)**: every `/work` card has the same 16:10 cover
  slot — the cover around an owner-set focal point, a cover narrower than
  960 px drawn at its own size on a tinted panel instead of stretched, or a
  CSS typographic cover — with true intrinsic sizes, Live / Archived
  status pills, and hover lift / press states (motion only when allowed).
  The cover field reports the image's real size and warns below 960 /
  1600 px, in the field and in the checklist.
- **Author card and sharing (D7)**: posts and case studies end with who
  wrote them (public CV name, the Home tagline's role, the cropped portrait,
  availability only when set) with *View CV* (`/cv/zh` for Chinese
  articles) and *Contact*, then *Copy link*, the system share sheet where
  the browser has one, LinkedIn and a WeChat QR code drawn on the server —
  nothing third-party loads until the reader acts.
- **Cross-links and filters (D8)**: a post's new *Case study* field links it
  and the case study both ways (meta row, *Write-ups*, and first in
  *Related*); tag and stack chips link to `/blog?tag=…` / `/work?tag=…`;
  both lists filter by `?tag=` with a shallow URL update inside a view
  transition, and a shared filtered link is filtered from the first paint
  by a tiny inline script (no layout shift).
- **Project archive (E8)**: `/work` ends with *All projects* — every project
  of the public CV, newest first, as a table (cards on phones) linked to its
  case study, borrowing role / stack / links from it; CV Studio projects gain
  optional *Your role* and *Stack* fields (not printed on the CV); a CV save
  regenerates `/work`.

### cv-docs

- **Real PDF CVs (E2).** `/cv.pdf` and `/cv/zh.pdf` are rendered on the
  server with pdfkit — no headless browser: selectable text in one reading
  order, embedded subset fonts (Geist for Latin, an OFL Noto Sans SC subset
  for everything Geist lacks, picked per character), Unicode line breaking
  (Chinese wraps between characters, URLs and skill tags stay whole), a
  tagged PDF 1.7 (headings, lists, sections, Link elements, artifacts for
  rules and footers, `/Lang`, displayed title, author / subject / keywords).
  Dated download names (`Li-Yanpei-CV-2026-10.pdf`, `…-CV-zh-…`), a strong
  ETag over everything the file is made of, `max-age=0, must-revalidate`,
  an in-memory cache keyed by that hash and a background re-render on every
  CV save, so no stale file is ever served. "Download PDF" on /cv and
  /cv/zh (and the phone action bar) is a real download instead of the print
  dialog; the palette has *Download CV (PDF)* and *Download CV in 中文 (PDF)*.
- **"Updated <month year>"** under the CV title (EN / 中文), in every file
  and in the CV's JSON-LD `dateModified`.
- **Plain text and JSON Resume (E5).** `/cv.txt`, `/cv/zh.txt` (for
  paste-in application forms: no hard wraps, full https URLs) and
  `/cv.json`, `/cv/zh.json` (JSON Resume 1.0.0: ISO dates, open ends
  omitted, profiles, languages split into language / fluency, patents as
  publications), offered under *More formats* with printing. Text and JSON
  are `noindex`; every file points to the HTML CV with `Link: rel=canonical`.
- **Evidence links (E3).** The CV header (A4 sheet, Reading view, PDF, text,
  JSON Resume) carries GitHub and LinkedIn — the CV's own value, else the
  Home → Socials link; hiding the field in CV Studio removes it (WhatsApp
  never). Projects print their case study (published only — a draft slug no
  longer reaches the public payload), live site and source code; new CV
  Studio fields *GitHub*, *LinkedIn*, *Live site*, *Source code*. The vCard
  adds the profiles as RFC 9554 `SOCIALPROFILE` (plus Apple's
  `X-SOCIALPROFILE`).
- **Skill evidence (E7).** Below the CV, every skill that is used somewhere
  lists the roles, projects, awards and patents on the page and the case
  studies and posts that use it (strict matching: word boundaries, aliases,
  case for short terms; no rows without evidence). A role's skills on the
  sheet and the skills in the Reading view link to their row.
- **Person / ProfilePage (E6).** The shared Person loader adds completed
  degrees (`hasCredential`), awards, `knowsLanguage` with BCP 47 codes
  (Mandarin → cmn, Cantonese → yue), a current role (`worksFor`) or study
  (`affiliation`) only while it runs, and de-duplicates skills ignoring
  case and parenthesised notes; `/` and `/about` are `og:type profile` with
  a `dateModified` ProfilePage.
- **ISR for /cv and /cv/zh (G1).** Statically generated, regenerated on
  every write that changes them (CV, home, post and case-study saves,
  version restores, store and Mongo restores — the Mongo config restore now
  refreshes /now too) and every minute (the month-dependent "Present" /
  "Expected", and the longest an edge copy lives without purging); a build-
  time copy is replaced on the first request. CV and home writes regenerate
  their pages twice so a render that started before the save can never be
  the one kept. `expireTime` is one day; a CV page change also purges its
  files at the edge.
- A field hidden in CV Studio before it ever had a value now counts as
  hidden (`redacted`), so no renderer fills it from another source.
- New dependencies: `pdfkit` 0.20.2 (MIT; pulls `fontkit`, `linebreak`,
  `png-js`, `fflate`, `@noble/*`), with `fontkit` 2.0.4 and `linebreak` 1.1.0
  pinned as direct dependencies; all server-only (`serverExternalPackages`),
  no change to the browser bundle.

### cv-studio-contact

- **Recruiter readiness in CV Studio (E9)**: a *Readiness* panel runs
  deterministic checks on the A4 CV in both languages — dates out of
  order, EN / 中文 dates or e-mails that disagree (and the CV vs the home
  page's e-mail), “expected 2025” or “in progress” after the date, future
  tense in finished roles, missing dates, entries with nothing to read,
  weak openings (“Participated in”, “Responsible for”, “参与”, “负责” …),
  too few measurable results, more than two A4 pages, missing links,
  published case studies the CV does not point to (or that point at a
  hidden project), entries shown in one language only and recommendations
  without permission. Each finding jumps to its field or can be dismissed
  (stored with the CV, back when the text changes); nothing is rewritten.
  The admin status hub shows the count and lists issues to fix first.
- **Chinese CV conventions (E10)**: the Home editor's availability gains a
  job intent for the Chinese CV (roles in Chinese, city; “Available from”
  as 到岗时间), printed as 求职意向 at the top of /cv/zh while the status is
  open or limited; an optional **self-assessment** section (自我评价); an
  optional **PDF-only photo** per language, off by default, never on the
  website, in search, JSON-LD or the vCard (the server-side PDF reads it
  through `readCvPdfPhoto(lang)` / `lib/cvLocale pdfPhoto`).
- **Work authorisation (CRIT-work-status)**: an owner-written right-to-work
  line in English and Chinese, shown on the contact page's availability
  card, next to the hiring fields of the form and in the CV header (/cv,
  /cv/zh); never inferred, never in JSON-LD or the vCard.
- **Recommendations (E11)**: a CV Studio section for quotes entered with
  each person's permission (quote, name, role, relation, date, source
  link). Entries without permission never leave the admin; the section's CV
  / Website switches choose /cv, /about or both; nothing renders until an
  entry exists. Plain figure / blockquote markup, no review schema.
- **Structured contact form (E12)**: each reason has a kind (role,
  freelance, collaboration, other — set per reason in the Home editor, the
  built-in reasons have defaults) and picking it discloses a few optional
  fields: company, a job posting / brief link (https only, never fetched),
  a timeline. They are sent as their own fields, capped, stored with the
  Inbox message (`meta`) and shown there as a card with the kind as a
  badge; the confirmation offers the CV, the contact card and the booking
  link. Nonce, human check, honeypot and caps are unchanged.
- **Contact privacy and retention (I11)**: the form states what is kept,
  why and for how long; messages older than `CONTACT_RETENTION_DAYS`
  (default 365, `0` off) are deleted every night, hidden from listings
  before that and never merged back by a restore; snapshots older than the
  period are pruned (the newest is kept). /colophon describes the inbox.
- **/contact is statically generated (G1)**: ISR with a 300 s window on top
  of on-demand regeneration after every home save, restore, storage pull or
  Mongo restore; the build-time copy regenerates on the first request.

### wave-2a integration

The seven streams above, merged and working together.

- **One theme control everywhere**: the mobile menu's segmented control
  offers System / Light / Dark from the same stored preference as the
  header menu and ⌘K, and follows the operating system live on System.
- **Real PDFs from every CV link**: the /about rail's *Download PDF* (in the
  language the CV stack shows), the mobile menu's *CV as PDF* and the CV
  Studio's PDF button open `/cv.pdf` / `/cv/zh.pdf` instead of the print
  dialog.
- **The PDF CV carries the new CV content**: the right-to-work line and the
  Chinese job intent (求职意向) under the name, the self-assessment and the
  recommendations given with permission; the optional photo appears only in
  the language whose PDF it was switched on for (top right, tagged with
  alternative text). The plain-text CV prints the same; the JSON Resume
  gains `references`.
- **Coherent ISR**: /, /about, /cv, /cv/zh and /contact are all statically
  regenerated with their own windows (1 h, 1 min, 5 min); a home save
  regenerates / /about /now /contact and both CV pages (availability feeds
  the CV header) and re-renders the PDFs; a CV save regenerates / /about
  /now /work and both CV pages.
- **One icon set and type scale**: article callouts, the share row and the
  video play button use the Lucide icons; the /work cards keep the token
  type scale, status colours and elevation after their redesign.
- **Tighter CSP**: `connect-src` is same-origin only (GitHub data comes
  through `/api/github/*`); CSP reports go to `/api/e`.
- **Fixes found while merging**: the home page prerenders again from a fresh
  checkout (a missing contact block no longer breaks the build); the image
  build checks the PDF font subset and libraries.

### publications

- **Publications (论文) in the CV**: a new CV Studio section for papers,
  preprints and theses — title, authors (ordered; add, remove and reorder
  by keyboard), venue and venue type, status (Published / In press /
  Accepted / Under review / Preprint, 已发表 / 印刷中 / 已录用 / 审稿中 /
  预印本), date (`YYYY` or `YYYY-MM`), volume, issue, pages, publisher,
  DOI, paper / PDF / code / slides links, abstract, keywords and award.
  Every field, paper and list item has the usual eye toggle and the CV /
  website switches. With linked languages, status, venue type, date,
  numbers, DOI and links are shared by EN and 中文 (text stays per
  language). Saving checks the status (required once a paper has a
  title), the DOI shape, the date shape and https-only links.
- **On the CV**: `/cv`, `/cv/zh`, the Reading view and the A4 sheet list
  the papers in citation style — the owner's name in bold (recognised from
  the public Personal Info in both languages, never hard-coded), venue in
  italics, a status label for anything not yet published, the DOI spelled
  out for paper, PDF / code / slides links and an abstract disclosure that
  is never printed. Published work first, then in press, accepted, under
  review and preprints, newest first. A paper under review never names
  its venue (APA 7). The renderers load on demand, so a CV without papers
  ships no extra JavaScript.
- **`/publications`**: every public paper with its anchor
  (`#<citation key>`), formatted citation, links, collapsible abstract and
  Copy BibTeX / Copy APA (plus copy-all), grouped by status, with year and
  status filters from six papers on; English chrome, Chinese entries
  marked `lang="zh-Hans"`. JSON-LD: a CollectionPage whose ItemList holds
  a ScholarlyArticle per paper (the site Person as author, DOI as
  identifier and `sameAs`, the journal / proceedings it is part of, a
  status, and no publication date for unpublished work). ISR, regenerated
  on every CV save, restore and import.
- **Nothing public without a paper**: until a public paper exists there is
  no CV section, no nav link (header, footer, drawer, ⌘K palette, the
  `/cv` header), no sitemap entry, and `/publications` answers 404. The
  page loaders ship the flag, so the link is in the server HTML (no
  request, no layout shift). Hidden fields, papers and authors never reach
  the HTML, `__NEXT_DATA__`, `/api/cvdata`, the JSON-LD or the sitemap.
- `lib/publications/` (pure): DOI normalisation, name matching, ordering,
  citation parts, BibTeX (entry type by venue type and status, escaped,
  case-protected, stable `lastnameYEARword` keys), APA 7, JSON-LD and JSON
  Resume `publications`, ready for the PDF CV, the exports and the home
  page.
- **With wave 2A**: the nav flag flows through the ISR loaders of /, /about,
  /cv, /cv/zh and /contact into the redesigned header, drawer, footer
  columns and palette; /publications is regenerated with the other CV pages
  on every CV save, restore and import, and a flip of the nav link also
  regenerates /blog, /uses, /contact and the collection pages. Its social
  card is a fixed preset, its icons the Lucide set.
- The `/cv` meta description names publications once a public paper exists
  (and still fits 160 columns with every section); CV Studio's sidebar says
  the Publications section appears on `/publications`, not on /about.

### publications (phase 2)

The papers everywhere else they belong. Still nothing public without a
public paper, nothing invented, and unpublished work always shows its real
status.

- **Downloadable CVs**: `/cv.pdf` and `/cv/zh.pdf` print the Publications
  section in citation style — the title with its date, the authors (the
  owner in the bold face, a hidden co-author as "…"), the venue slanted
  (Chinese text stays upright) with volume(issue), pages and publisher, the
  status of anything not yet published (ACCEPTED / 审稿中 …), the award,
  then the DOI as its `https://doi.org/…` link and the PDF / code / slides /
  paper links (site paths made absolute). `/cv.txt` prints the same as
  citation lines with "Status: …" and the DOI URL; `/cv.json` lists the
  papers in JSON Resume `publications` (name, publisher, releaseDate, url,
  summary — work not yet published names its status in `publisher` and
  has no release date unless it is a released preprint), followed by the
  patents as before.
- **A CV whose only public content is papers** now gets `/cv.pdf`,
  `/cv.txt`, `/cv.json` and the /cv download menu instead of a 404
  (review finding CORR-1).
- **JSON Resume dates** (CORR-2): an entry whose end date the owner hid
  (work, education, projects) carries no date range at all, instead of a
  start date that read as "still running".
- **Home: Selected Publications** — a new owner-ordered home section (after
  projects by default, in the recruiter-first preset after experience),
  listing the first three papers of `/publications` with their year,
  authors (the owner in bold), venue, status chip and award; each title
  opens the paper's anchor on `/publications`, and "All N publications"
  links the list. Absent without a public paper; its code loads only with
  a page that has the section.
- **/about**: the identity rail links `/publications` with the paper count
  ("Publications: 3 papers" to screen readers).
- **Proof strip**: the Home editor suggests every published paper verbatim
  (title; "venue · year"), linking its `/publications` anchor.
- **Search**: one ⌘K document per public paper (title, status, venue,
  year, visible authors, abstract, award, keywords) at its `/publications`
  anchor, or at the `/cv` anchor when the section is on the CV only.
- **CV Studio readiness**: a published paper without its venue, date, or a
  DOI / paper / PDF link is flagged at the field, and so is a paper still
  "under review" more than 18 months after its date. Hidden fields are a
  choice, not a gap; papers are checked wherever they are public.
- **Skill evidence**: a paper whose keywords (or, word-bounded, its title
  and abstract) name a CV skill is listed under that skill on `/cv`, linked
  to the paper.
- The leak tests now cover the Publications section in the PDF, text and
  JSON Resume exports, and new tests cover the home section, the search
  documents and the export store; an @admin end-to-end test adds a paper
  and finds it in the PDF text, the JSON Resume, the home page and search,
  then restores the stored CV.

### wave2a-fixes

Fixes for defects an adversarial review found in wave 2A before it shipped.

- **Error monitor (SECU-1)**: anonymous browser and CSP reports can no
  longer fill the error monitor and hide real server errors. Browser
  reports get their own share (300 of the 500 fingerprints, at most 30 new
  ones an hour across every sender) and their own daily budget; server
  errors keep the rest of the table and a daily budget of their own, and a
  new server error replaces the least valuable browser report (resolved
  first, ignored last) when the table is full. Reports refused by a cap no
  longer use up the day's budget.
- **Sign-in history (SECU-2)**: failed sign-ins and failed identity checks
  no longer push real sign-ins and security changes out of the 500-entry
  history (about 50 junk requests could erase a foreign sign-in). Failures
  are now counted per hour, method, country and reason code in a table of
  their own (auth.db migration 2 moves the existing ones); Admin → Security
  lists the newest 40 sign-ins and security changes and, above them, a
  "Failed attempts" summary for the last 24 hours, 7 and 30 days by method
  and country.
- **Browsers signed in before the update (SECU-3)**: an admin token issued
  before sessions existed has no session id, so "Sign out other browsers",
  signing out one browser and Log out could not end it (only "Sign out
  everywhere" or a password reset did), and it never appeared in the list.
  Now the first of those actions ends every such token as well — the
  owner's own session is never affected — and the Security page says so,
  keeping "Sign out other browsers" available while such a browser may
  still exist (at most a week after the update).
- **auth.db file permissions (SECU-4)**: `data/auth.db` was made `0600`
  only after SQLite had already created its `-wal` and `-shm` files `0644`,
  and those hold nearly all of its recent data (recovery-code hashes,
  session ids, the sign-in history). The file is now created `0600` before
  SQLite opens it (so the sidecars start `0600`), all three are made `0600`
  on every open — repairing files left world-readable — and the
  pre-migration copy and `scripts/migrate-db.mjs` follow the same rule.
- **Deploys and the edge cache (OPS-1)**: /, /about, /contact and the CV
  pages are now ISR, so Cloudflare could keep the previous build's HTML for
  up to an hour after a deploy (/colophon a year), and that HTML points at
  scripts the new image does not have. Now:
  - `scripts/deploy.sh` purges the zone right after the switch with the
    app's own `CF_ZONE_ID` + `CF_API_TOKEN` (`scripts/edge-purge.mjs`, run
    inside the new container: `purge_everything`, else every cacheable URL
    in batches of 30), warns clearly when they are missing, checks that the
    cache-busting `/` serves the new build id (else it rolls back) and
    reports what the edge serves for `/` without a query string;
  - Cloudflare keeps HTML at most 5 minutes
    (`Cloudflare-CDN-Cache-Control: max-age=300, stale-if-error=86400` on
    HTML whose shared lifetime is longer), whatever the ISR window;
  - the container keeps the browser assets of the builds deployed in the
    last week (`scripts/static-archive.mjs`, the `landing-static-archive`
    volume), so open tabs and any edge copy of old HTML keep working.

### i18n-content

Bilingual and machine-readable content (F1, F2, G9).

- **Chinese typesetting** for posts and case studies (W3C clreq): no
  tracking on Han characters, a 34-character measure, 1.85 leading in the
  body (1.4 headings, 1.25 title), Han ↔ Latin spacing through
  `text-autospace` with a 1/8 em fallback mark for browsers without it (the
  text itself is never changed), emphasis dots (着重号) instead of a fake
  italic, each platform's Simplified or Traditional Chinese face before
  `system-ui`, and quotes, dashes, ellipses and the middle dot from the
  Chinese face (local fonts only, nothing downloaded). Scoped to articles:
  the CV print layout is untouched.
- **Chinese interface words** on Chinese posts and case studies — 日期 /
  阅读 / ← 全部文章 / 本页目录 / 作者 / 分享 / 上一篇 … — with dates as
  2026年5月30日, Traditional Chinese for zh-Hant pieces, and English
  names, roles and tags inside marked `lang="en"`. Callout titles,
  footnotes, heading self-links, the code-copy button, the image viewer and
  the video facade follow the article too.
- **`lib/uiStrings/`, the single source of UI strings** (EN, 简体, 繁體): a
  small typed dictionary, one module per part of the interface (article,
  content, compile, lists, languages), plain strings with `{placeholders}`;
  the bilingual site chrome adds its modules there. A post or case study
  receives only its own language's words with its props, so no page
  bundles the other languages (shared first-load JS 204.2 → 203.7 kB).
- **Linked translations** (`translationKey`): versions of a post or case
  study in different languages that share a key link to each other — a
  "阅读中文版" / "Read in English" switch on the page, reciprocal hreflang
  with x-default, `xhtml:link` alternates in the sitemap — and the indexes
  and the home page list the piece once (in English where it exists, "Also
  in 简体中文"). Prev / next, related links and a post's case study stay in
  the article's language. Only reciprocal, published groups link; two
  versions in one language link nothing. Saving a version regenerates its
  translations first, including a group it just left.
- **Editor**: a "Language & translations" block in the post and
  case-study editors — the language (detected unless set), the key (kept to
  a–z, 0–9, - and _), the other versions with their language and draft
  state, a warning when two share a language, and **Create draft**, which
  copies the saved version into a new draft in another language with the
  same key (never machine-translated, never published).
- **`/llms.txt`, `/llms-full.txt` and Markdown twins** (llmstxt.org): every
  published post and case study is also served as Markdown at its address
  plus `.md` (`/blog/<slug>.md`), converted from the MDX source without
  evaluating anything and showing only what the page shows, with
  `rel="canonical"` and `X-Robots-Tag: noindex`, linked from the page with
  `<link rel="alternate" type="text/markdown">`. `/llms.txt` lists the
  profile, the CV in each language that has public content, every case
  study and post (language and date noted) and the feeds; no contact
  details, no CV data, never a draft. Edge caches are purged with the
  pages they derive from; `robots.txt` is unchanged.

### motion

Motion and interaction (C1, C2, C5, C6, C7, C9).

- **Cards morph into their pages** (C1): opening a post row, a case-study
  card, a home "Writing & case studies" row or a /now card, its title (and,
  for an image cover, the cover's frame) morphs into the page's; Back flies
  it home to the card it came from (or to the collection). The title is
  never stretched: both snapshots keep their size and fade through while
  the box moves. The page itself now *fades through* (the outgoing page is
  gone before the incoming one appears), so two pages are never seen on top
  of each other. Names are set only for the one transition that links two
  elements (never in the markup), nothing morphs out from under an open
  palette or menu, and reduced motion stays instant. Full page loads
  between the site's pages fade too (`@view-transition`). The morph code is
  its own chunk, fetched while the browser is idle.
- **Slow-navigation feedback** (C2): a navigation still loading after
  150 ms shows a thin bar on the header's bottom edge (a still line under
  reduced motion), marks `<main>` `aria-busy` and the followed link
  (progress cursor), and after a second says "Loading…" to screen readers.
  A fast navigation shows nothing, and the bar is gone before a transition
  takes its snapshot.
- **Command palette 4.0** (C5): from the keyboard (⌘K, `/`, `?`) it is
  simply there, with no entrance animation; from a click it still scales
  in. The first frame is only the panel and the field — the rows, and the
  read of the page's sections, follow a frame later; ranking runs on a
  deferred copy of the query; phones get a plain scrim instead of a
  full-screen blur. Nested pages **Theme ›, CV ›, Contact ›** and
  **Keyboard shortcuts ›** (also `?`) gather their actions; Esc or ⌫ in
  the empty field goes back with the entry highlighted, and a search from
  the top still finds everything inside them. A highlighted page is
  prefetched after 120 ms and Enter opens it at once. Measured with the
  Event Timing API (Playwright, input → next paint, median of 5): first
  open by tap on a Pixel 7 profile at 4× CPU throttling 128 → 80 ms,
  typing 72 → 24 ms; ⌘K on desktop 48 → 40 ms, typing 56 → 32 ms.
- **Touch press feedback, no sticky hover** (C6): every Chakra hover style
  now applies only where a pointer can hover (`@media (hover:hover)`,
  through the site's Emotion cache, `lib/hoverMedia.ts`), as do the static
  ones in `globals.css` — a tapped button no longer keeps its hover look.
  No grey tap flash; list rows and cards sink a little and tint while
  pressed (after 40 ms, so a scroll does not flash them); plain links dim.
  The scroll-to-top button fades and rises in, and is out of the tab order
  while hidden.
- **Reading micro-motion** (C7): the sticky header's hairline and shadow
  appear only once it is stuck over the page (a scroll-state container
  query; elsewhere the hairline stays). In long articles on phones and
  tablets the header tucks away while reading down and returns on the
  first scroll up — never while a dialog or the article outline is open, a
  slow navigation is loading or focus is in the header. The outline's
  current-section marker glides between entries.
- **Visitor keyboard layer** (C9): `J` / `K` move through the items of
  /blog, /work and /publications (focus lands on the item's link, so `↵`
  opens it); `[` / `]` previous / next article; `T` switches light / dark;
  `?` lists every shortcut; when no second key follows `G` within 450 ms,
  a hint shows where `G` then a letter goes. All single-key shortcuts respect the on/off switch (WCAG 2.1.4),
  never fire in a field, a dialog or a menu, with a modifier or while an
  input method is composing; ⌘K stays in the header. Only the listener is
  in the shared bundle — the actions load while the browser is idle.
- Shared first-load JS 203.8 → 205.6 kB gzip (listener, slow-navigation
  bar, hover guard, morph loader); the palette, the keyboard actions and
  the morphs are lazy chunks.

### review-fixes-2b

Fixes for defects an adversarial review found in wave 2B before it shipped.

- **Toasts (CORR-1)**: the on-demand toast host drew Chakra's stock frame,
  so the one toast policy never applied — error toasts vanished after 5 s
  and were not announced as alerts. The host now renders every toast in the
  unified frame (errors and loading toasts stay until dismissed, the timer
  pauses on hover, focus and a hidden tab, errors are alerts); frame and
  host load together, outside the first-load JS, and a toast raised before
  they have loaded appears once, already in its final frame. Toasts also
  became visible again: the host rendered outside the app's LazyMotion, so
  every toast stayed at opacity 0; it now brings its own LazyMotion and
  honours reduced motion.
- **Keyboard focus on touch screens (CORR-2)**: the hover guard moved whole
  selector lists behind `@media (hover:hover)`, taking the `:focus-visible`
  / `:focus-within` reveals written beside a `:hover` with them — hints on
  the home page and /about, heading self-links, copy buttons, publication
  permalinks stayed hidden for a keyboard on a phone or tablet. Only the
  hover selectors move now.
- **Error monitor (SECU-2)**: one address could fill the browser-report
  share of the error monitor in ten hours and blind it to new CSP blocks
  and client errors for 90 days. Each sender (address / network) now gets a
  small daily share of new problems (5 / 20) and of stored events
  (1 000 / 4 000); a flood still cannot delete older reports.
- **Admin record (SECU-3)**: an unreadable `data/admin.json` made the
  session version 0, so tokens revoked by "Sign out everywhere" worked
  again. A record that exists but cannot be read or parsed now fails
  closed (no admin session anywhere, no sign-in) and is never re-created
  over; only a missing one is bootstrapped from the environment.
- **Unpublished case studies (CV-L-2, CV-L-3)**: a CV project's case study
  and a post's `project` that name a draft or deleted case study no longer
  ship the slug — not in GET /api/cvdata, the CV data of any page, /blog,
  a post page or the prev / next / related links of its neighbours. Draft
  Mode keeps the owner's value.
- **Papers without a status (CV-L-4, CV-L-5)**: a paper with an empty,
  hidden or unknown status (or no title) renders nowhere, and now its record
  is not in the public CV data either; the leak tests check the raw public
  projections (/api/cvdata, the /cv page props) for it and for the venue of
  a paper under review.
- **Draft preview (CORR-3)**: previewing a pending change to a post's
  translation link shows the language switch it will have.
- **Markdown twins after a rename (CORR-4)**: `/blog/<old>.md` and
  `/work/<old>.md` now answer 308 to the twin at the new address, like the
  page, instead of 404.
- **Privacy (PRIV-4)**: the fixture's owner-neutral test no longer names
  organisations; it reads the owner's facts from the local store at test
  time and skips that part without one.
- **CV Studio preview**: the A4 preview links a project's case study only
  when /cv does (a published one), so it no longer shows — and prefetches —
  a link to a case study that does not exist.
- **Admin keyboard**: j / k from the page body move through the admin lists
  again (Content health, posts) — the visitor keyboard layer had been taking
  the keys first — and a "G" pressed while a page changes still starts a
  "G then …" chord.
- **End-to-end suite**: admin clean-ups now really delete what the tests
  created when the suite runs over plain http.

### orcid

The owner's ORCID iD (owner request, 2026-10-20: 添加ORCID连接和显示). Nothing
is public until the owner enters an iD; no iD is ever invented.

- **The iD is CV data**: a new *ORCID iD* field in CV Studio → Personal Info
  (shared by EN and 中文), checked with ORCID's ISO 7064 MOD 11-2 checksum —
  a typo in the last character gets its own message, a wrong shape another.
  A pasted `https://orcid.org/…` link (or the iD without hyphens) is stored
  as the bare iD, by the editor and again on every save and import
  (`withBareOrcid`). The usual eye toggle hides it: hidden, it reaches no
  page, file, feed or structured data (the leak tests cover it).
- **Shown as ORCID's iD display guidelines ask**: the official green iD icon
  (inline SVG, 16 px, decorative) followed by the full `https://orcid.org/…`
  URI as the link text, named "ORCID iD: https://orcid.org/… (opens in a new
  tab)" for screen readers; in a narrow column the URI breaks after
  `orcid.org/`, never inside the iD. On `/cv` and `/cv/zh` (A4 sheet and
  Reading view), `/publications` (under the lede), the /about identity rail.
  The PDF CVs (EN + 中文) and `/cv.txt` print `ORCID: https://orcid.org/…`
  as a text link; `/cv.json` lists it in `basics.profiles` (`network:
  ORCID`, `username`: the iD); the vCard carries `URL;TYPE=orcid` and
  `X-ORCID`; the Person JSON-LD adds the record to `sameAs` and an ORCID
  `identifier` (PropertyValue), and each ScholarlyArticle names the owner by
  the record's URI as `@id`; `/llms.txt` gets one `- ORCID iD:` line.
- **Readiness**: a low-severity suggestion when a public paper has a DOI but
  the CV has no ORCID iD (a hidden field is a decision and never reported).
- **Import from ORCID** (CV Studio → Publications): with an iD set, the
  dialog lists the record's public works — read on the server by
  `POST /api/admin/orcid/works` (admin only, 10 reads per browser per 10
  minutes, every read in the activity log without the iD) from
  `https://pub.orcid.org/v3.0/<iD>/works` and its bulk details (authors,
  abstract; 100 per call) through `safeFetch`, one allow-listed host, no
  redirects. Each work group becomes one candidate from the researcher's
  preferred version (highest display index): title, venue, ORCID type →
  venue type and status (preprints stay preprints), year / month, DOI and
  other identifiers, an https link. Works already on the CV (same DOI, else
  the same normalised title) and non-paper types (patents, datasets,
  software …) are left unticked; the ticked ones are added to the unsaved
  document as one undo step, like papers typed by hand (mirrored into the
  other language when linked) — nothing is saved until the owner saves.
  Clear messages for no iD, an unknown record, no public works, ORCID busy
  (429 / 5xx, with its wait), a timeout, an unreadable answer and an ended
  session. Unit tests run over synthetic fixtures in ORCID's v3.0 works
  shape; no browser request ever goes to ORCID (`connect-src` unchanged).
- `/colophon` and `public/licenses/orcid.txt` state that the iD icon is
  ORCID's trademark, used as its guidelines allow, outside the site's
  licence.
- `lib/orcid/`: `id` (parse, checksum, normalise), `uri` (the light check
  for code on every page), `cv` (the one reader), `works` (mapping, details,
  dedupe), `fetch`, `route`, `importClient`. Shared first-load JS unchanged
  in content (167.0 KiB vs 166.6 at the base, minifier naming); each public
  page carries ~0.3 KiB more for the Person node's ORCID support; the Studio
  dialog is its own chunk.

### orcid-connect

"Connect your ORCID iD" — the connection half of the owner's request (ORCID连接和
显示), which ORCID's display guidelines require before the green iD icon may be
shown.

- **Connect your ORCID iD** next to the iD field in CV Studio → Personal Info:
  ORCID's sign-in button (the iD icon, white, hairline border) as a plain link
  to `GET /api/admin/orcid/connect`. It sends a signed-in admin to ORCID's
  OAuth sign-in — authorization code, scope `/authenticate` only (no access
  to the record) — with a random `state` bound to that admin session in a
  signed, single-use, 10-minute, HttpOnly `SameSite=Lax` cookie scoped to the
  callback. `GET /api/admin/orcid/callback` checks the state against the
  cookie (once), that the session that started it is still live and current
  (and the same one, if a session cookie came along), exchanges the code on
  the server at ORCID's token endpoint (`safeFetch`, now able to POST, one
  host, never redirected; the secret never reaches the browser), stores the
  confirmed iD in both languages' Personal Info with the marker
  `orcidAuthenticated: { id, at }`, regenerates the CV pages, records
  `orcid.connect` in the activity log (attributed to the session; never a
  token) and discards the access token. A typed iD that differed is
  replaced, and the toast says so.
- **The Strict session cookie**: the admin cookie is `SameSite=Strict`, so the
  browser does not send it on the way back from orcid.org. The proxy lets
  only `GET /api/admin/orcid/callback` through without it (the route
  authorises itself, see above), and the callback answers a small same-origin
  page (meta refresh, no script, no referrer) instead of a redirect: the
  navigation it starts is same-site, so the Studio opens signed in.
- Every outcome returns to the Studio with a toast and focus on the iD field:
  connected, cancelled on ORCID, an unmatched or reused link, more than 10
  minutes, a session that ended or changed, ORCID errors, refused code or
  client credentials, ORCID busy / slow / unreachable / unreadable, no
  Personal Info, not configured, wrong host, too many attempts.
- **Disconnect…** (with an inline confirm) removes the marker and keeps the iD,
  which then shows as unauthenticated; clearing or hiding it stays an ordinary
  edit. `DELETE /api/admin/orcid/connection` (If-Match against the Studio's
  copy, which adopts the result without a reload; `orcid.disconnect` in the
  activity log). `GET` answers whether the server is set up (never a secret).
- **The marker belongs to the server**: changing the iD in the Studio drops it
  in the same undo step; a save keeps it only where the CV still carries the
  stored marker with the same iD, so a hand-edited iD is unauthenticated from
  then on and a marker typed into the JSON or an import is ignored. Public
  views carry it only as `{ id }`, only while the iD is public and still the
  confirmed one (the connection time stays private).
- **Display**: an authenticated iD keeps the green iD icon; a typed-in one now
  shows ORCID's unauthenticated iD icon (the outlined iD, redrawn from ORCID's
  guideline artwork and checked against it pixel by pixel) and
  "(unauthenticated)" — "（未经认证）", ORCID's own zh-CN wording, on Chinese
  pages — after the link, on `/cv`, `/cv/zh` (sheet and Reading view), the
  /about rail, `/publications`, the Studio preview and the import dialog. The
  PDF, text and JSON CVs, the vCard and the JSON-LD keep the URI alone either
  way. `/colophon` and `public/licenses/orcid.txt` describe both icons.
- **Without credentials** the button is disabled, and the line under it says
  why (`ORCID_CLIENT_ID`, `ORCID_CLIENT_SECRET`) with a link to the set-up
  guide; a malformed client ID or an unknown `ORCID_ENV` is named.
  `ORCID_ENV=sandbox` uses sandbox.orcid.org. Documented in `.env.example` and
  both READMEs (registering a Public API client, the redirect URI
  `https://lucian-dev.com/api/admin/orcid/callback`).
- Tests: `tests/orcid-connect.test.ts` (config, authorize URL, state expiry /
  tampering / replay / mismatch, marker lifecycle and public form, display
  choice, the Studio's states and messages, the return page, the proxy) and
  `tests/orcid-connect-route.test.ts` (the routes over a temporary store
  against a local fake ORCID token endpoint — no network); e2e
  `e2e/orcid-connect.spec.ts` (@admin: the disabled state, the callback's
  error paths arriving cross-site); `e2e/orcid.spec.ts` expects the
  unauthenticated form for a typed iD.
- Fixed (CV Studio): the A4 preview linked a project's case-study slug to
  `/work/<slug>` even when no such case study was published (a 404 link, and
  a console 404 from its prefetch). It now resolves case-study links as `/cv`
  does (`withEvidenceLinks`: a published slug, else a strict title match,
  else none), and the project editor says so under the field: "No published
  case study at /work/<slug>" (or that it is still a draft).

### review-fixes-r2

The second review round's findings (UX / accessibility, visual / motion,
operations) on the release candidate.

- **Toasts never cover a bottom bar** (UX-A-1): on a phone, toasts sit above
  the /cv action bar and the draft-preview bar (`--bottom-bar-h`, which
  already includes the safe-area inset) instead of on their buttons — an
  error toast stays until dismissed, and Download PDF, EN / 中文, More
  formats and Copy link were unreachable under it. On narrow screens the
  scroll-to-top button moves up above any bottom toast (`--toast-stack-h`).
- **Ask speaks Chinese as Chinese** (UX-A-2): the "no answer", "ask more
  specifically", loading and error views, the options and their key hints,
  the palette's status line while asking, and the search view's
  "提问：…" row (its hint and badge too) carry `lang="zh-Hans"` for a Chinese
  question (WCAG 3.1.2), as the answer view already did.
- **"Ask Lucian directly" on /contact keeps focus** (UX-A-3): the form takes
  the hand-off, focuses the message once the palette's focus trap has let go
  (`lib/focusAfterDialog`, shared with the cited-quote focus), centres it with
  the caret after the question, and announces "Your question is in the
  Message field" — focus used to end on `<body>`.
- **"?" on a tablet with a keyboard** (UX-A-4): the first key press only a
  hardware keyboard can make marks the page (`data-keyboard`), and the key
  hints hidden on touch screens come back — the Keyboard shortcuts page
  lists every key instead of an empty page.
- **Keyboard shortcuts page header** (VISU-3): no Search / Ask switch on a
  nested page (the chip, ⌫ and Esc lead back), a short "Filter…"
  placeholder, a field never narrower than 72 px, Esc hidden below `sm`, a
  chip that gives way with an ellipsis; an option's label keeps its width
  and its side hint truncates first.
- **Small covers morph cleanly** (VISU-1): a logo-like cover morphs as its
  tinted panel and, apart from it, its logo (`vt-morph-panel`,
  `vt-morph-logo`), so the logo travels at its own size — never a magnified,
  blurred copy behind the sharp one, opening or flying back.
- **No ghosting in morphs** (VISU-2): the outgoing title fades within 0.15 of
  the route and the old page within 0.2; the new page comes in over the
  second half, once the title has nearly landed. Reduced motion stays
  instant.
- **Admin**: j / k work after a click on a panel's blank space (UX-A-5); the
  admin's checkboxes get a ≥ 3:1 border (`--control-border`, admin-only CSS, UX-A-6); the
  Activity log's area label, the Inbox star, the version-history labels, the
  line-diff "unchanged lines", the tab shortcut hints, the error fingerprint
  and the editor placeholder move off the decorative `page.muted` to
  contrast-safe tokens, no smaller than 11 px (UX-A-7, VISU-5); a table
  wider than the screen (analytics, vitals attribution, storage) becomes a
  focusable, labelled region while it overflows (UX-A-8); the content health
  summary cards align their labels (VISU-4); the editor header wraps under
  the title — on a phone the save state is a row and "Save" / "Publish…" fit
  on the next, the "?" button shows from `lg` and never sits alone (VISU-6).
- **Uploads queue their encoding** (OPS-2): one process-wide queue
  (`lib/imageJobs`, on `globalThis` so every API route shares it) encodes
  one image at a time (`IMAGE_JOB_CONCURRENCY`, default 1), at most
  `IMAGE_JOB_QUEUE_MAX` (8) wait, beyond that 503 `{ code: 'BUSY' }` with
  Retry-After; the media-optimize backfill takes its turn per image. libvips
  uses at most `SHARP_CONCURRENCY` threads (default: CPUs, at most 2) and a
  small operation cache. Four concurrent large uploads no longer push the
  1 GiB container into the OOM killer.
- **Container gate** (OPS-1 follow-up): `scripts/check-container.sh` runs an
  explicit, macOS-safe project list — Chromium (desktop, tablet, phone,
  reduced motion) and WebKit, then `@admin` with `--no-deps` — and installs
  both browsers; Firefox and the visual baselines stay in
  `scripts/check-fixture-gates.sh` (Linux image).
- Tests: `tests/review-fixes-r2.test.ts`, `e2e/review-r2.spec.ts`.

### Changed

- **No hosted CI**: `.github/workflows/ci.yml` is removed, so pushes and pull
  requests no longer run GitHub Actions. The same gates (`yarn run check`,
  `yarn build` + `scripts/perf-budget.mjs`, `yarn audit:deps`) are run
  locally before pushing; the docker job's checks (compose config, image
  build, fresh-data start, runtime hardening, E2E against the container,
  graceful stop) moved into `scripts/check-container.sh`. README → *Quality
  gates* lists them.
  `scripts/deploy.sh`, Dependabot and the issue / PR templates stay.
- **No more "[01] INTRODUCTION" labels** (owner request): the public site
  has no `[NN]` index markers or bracket labels any more. Every page section
  opens with one plain heading (`components/General-UI/SectionHeading`, the
  new `section` text style: sans, title size, weight 500) — the home
  sections, Bio / Recommendations / CV on /about, /now's groups, the /cv
  skill evidence and the 404 suggestions — keeping the section ids,
  `aria-labelledby`, the section navs and the label-only reveal. The hero
  loses its "Introduction" label, the /about CV cards their `[01]`…`[08]`
  prefixes (titles and counts stay), the mobile menu its `01`…`09` link
  numbers, the latest-writing list and the social cards their `[POST]` /
  `[BLOG]` brackets. A unit test keeps bracket and zero-padded index labels
  out of public components.

### Fixed

- **Deleted pages stay deleted after a restart**: Next.js keeps the last 200
  copy of an ISR page on disk when the page turns into a 404, so a restart
  served a deleted or unpublished post or case study (or /publications
  without a paper) again. The persisted copies of every page whose content
  is gone are now removed after each content write — deletes, unpublishing,
  renames, snapshot / backup / Mongo restores, storage pulls, CV saves
  (`lib/isrCache`, `lib/isrPages`, run by `revalidatePaths`) — and at server
  start.
- The lint run no longer crashes on the admin auth store's mapped type.

## [2.3.0] — 2026-10-13

A research round across eight directions (UI, motion, reading, recruiter
value, admin, performance/SEO/accessibility, advanced features, security and
operations) with a live defect sweep of production, followed by the fixes
for every confirmed defect that needed no owner input, an adversarial review
of those fixes, and the move to Next.js 16.

### Fixed

- The home page no longer widens past the screen once its lazy sections
  mount (phones zoomed out to 1439 px); stat labels and accordion titles wrap
  instead of breaking or truncating.
- The hero only claims what is current: an ongoing role or study, otherwise
  no chip (it showed a job that ended in March); location and languages come
  from the CV in the CV's order. One Person entity on every page, with the
  real portrait.
- Real-user Web Vitals are recorded (none were before), and a CLS or INP that
  grows after a tab switch replaces the earlier value.
- Admin saves keep frontmatter fields the editors do not show (SEO title,
  updated date, language, cover alt); article images get their srcset once
  variants exist; footnotes stay out of the table of contents, are localised
  in Chinese articles, and highlighted code lines and file names render.
- Back/Forward run the directional page transition; open menus and dialogs no
  longer ghost over the next page; sections are visible in the first frame
  after a client navigation; printing shows every row.
- Keyboard: focus moves to the new page after navigation and is never hidden
  under the sticky header (WCAG 2.4.11), focusing the header or the CV action
  bar no longer scrolls the page, and single-key shortcuts can be switched off
  (WCAG 2.1.4).
- English chrome on Chinese pages is marked `lang="en"`; header glass and form
  errors meet contrast; light visitors no longer see a repaint; the mono
  fallback no longer shifts article metadata; dark-theme prints are readable,
  and only the CV page forces A4 without margins; head tags are unique.
- Operations: `/api/health` shows details only to the admin (or a
  `HEALTH_TOKEN`), and a malformed session cookie can no longer make admin
  routes answer 500; deploy backups keep the 10 newest; the IndexNow key is
  served from the site root; `/.well-known/security.txt` exists; `/colophon`
  and SECURITY.md describe the stack accurately.

### Platform

- Next.js 15.5.27 → 16.3.8 (Pages Router, React 18.3 unchanged: the Pages
  Router uses the React in package.json and Next 16 still accepts 18.2+).
  16.3.8 carries the same 2026-09-30 security fixes as 15.5.27 (SSG/ISR
  cache poisoning) and more; Next 15 leaves maintenance LTS on 2026-10-21.
- Builds stay on webpack: Next 16 defaults to Turbopack, so `yarn dev` /
  `yarn build` (and with them the Dockerfile and CI) run `next dev --webpack`
  / `next build --webpack`. `next build` no longer runs ESLint (CI lints
  separately, as before).
- Next 16 sets `"jsx": "react-jsx"` in tsconfig.json; the classic
  `import React from 'react'` lines that only served JSX are gone (76 files).
- Still on deprecated-but-supported Edge conventions, kept on purpose:
  `middleware.ts` (Next 16 calls it `proxy.ts`, which cannot run on the Edge
  runtime) and the Edge `/api/og` route. `next build` prints a deprecation
  notice for each.

### Removed

- The optional Sentry integration (`@sentry/nextjs` 8 does not support
  Next 16, and no DSN was ever configured): the `withSentryConfig` wrap, the
  `sentry.*.config.ts` files, the Sentry parts of `instrumentation.ts` (it
  still starts the backup schedule and adds `no-transform` to HTML), the API
  wrapper, the error boundary and `_error`, the `NEXT_PUBLIC_SENTRY_*` build
  args, the env docs and the Sentry hosts in the CSP `connect-src` (now
  `'self' https://api.github.com`). The standalone output no longer ships the
  SDK or OpenTelemetry (135 MB → 109 MB).
- Every audit allowlist entry: none is reported any more (Next 16 ships
  postcss 8.5; the Sentry build plugin was the only path to the others).

## [2.2.0] — 2026-10-13

A research-driven round (benchmarks of leading developer portfolios and CMS
admins, live visual/performance/accessibility/SEO audits) on a new platform:
Next.js 15.5 and patched dependencies.

### Security

- Next.js 14.2 → 15.5.27 (Pages Router, React 18): closes the image
  optimizer RCE/DoS, rewrite SSRF/smuggling and SSG/ISR cache-poisoning
  advisories. On-request image optimization is disabled (`/_next/image` →
  404); uploads are resized and converted at upload time instead.
- Tiptap 3.31.3, prosemirror-view 1.42.6, nodemailer 10.0.12, sharp 0.35.5
  and resolutions for vulnerable transitive packages; CI audit gate with a
  reviewed allowlist (build-time tooling only).
- MDX renders from a server-built tree without `eval`; the production CSP
  no longer allows `'unsafe-eval'`. Embeds are an allow-list (YouTube,
  Vimeo, figures).
- Every server-side fetch of a content- or admin-supplied URL goes through
  `lib/security/safeFetch` (public addresses only, DNS pinned, redirects
  re-checked, size and time limits).
- Uploaded and imported images lose their EXIF / XMP (GPS, camera serials)
  — losslessly when no resize or rotation is needed — and images that decode
  to more than 80 MP are refused with 413.
- Compiled articles and the feeds only carry safe link and image URLs
  (`javascript:` / `data:` are removed); embeds accept player URLs only.
- Signing out also ends Draft Mode, and the Draft bar's Exit works without a
  session.
- Analytics records article paths only for published slugs and gives each
  client and network a bounded share of the event budget.
- The tracked CV seed holds only public content; an old snapshot is no
  longer tracked.

### Added

- **Typography & motion**: real Geist Sans/Mono (two preloads, ~141 KB),
  balanced headings and tabular figures; circular theme reveal from the
  toggle; directional page transitions with a pinned header; blur-rise hero
  headline; cursor-lit card borders and hover-intent lists; scroll-driven
  experience rail; shared-element photo lightbox; number roll-ups. All
  transform/opacity only and off under reduced motion.
- **Home**: faster hero (pre-baked responsive WebP), Skills from the CV,
  writing & case-study links, full-width Field Notes, GitHub data rendered
  in the HTML, indigo contribution graph.
- **Command palette 3.0**: loads on demand, searches posts, case studies
  and CV entries, owner actions (inbox, backup, log out), vCard and booking.
- **Articles**: GFM tables/strikethrough, zero-CLS responsive images,
  refined reading layout, full-content `/feed.xml`, `/work/feed.xml`,
  `/feed.json`, Draft Mode with an Edit pill.
- **Pages**: `/cv/zh` as a real Chinese page (title, description, JSON-LD),
  per-entry CV anchors, contact availability card, vCard and QR, `/colophon`
  generated from the repository.
- **Authoring**: local drafts and conflict-safe saves for every editor,
  item history and undo-delete, compile-checked publishing with a checklist,
  side-by-side live preview, slash menu, upload-time WebP variants and safe
  remote image import.
- **Admin**: status hub with "Needs attention", Save and leave dialog,
  keyboard shortcuts overlay, sortable home cards, CV/home validation, and
  first-party cookieless **Analytics** with real-user Web Vitals.
- **Operations**: `scripts/deploy.sh` (bundle-based deploy with backups,
  health/warm-up gating, smoke test and automatic rollback), scheduled
  change-aware backups, structured JSON logs with request ids, Playwright +
  axe browser tests and a performance budget in CI.

### Changed

- Shared JavaScript 225 → 204 kB (`_app` 137 → 114 kB): palette, drawer and
  below-the-fold widgets load on demand; brand icons are inline SVG.
- `docker-compose.override.yml` is no longer tracked; copy
  `docker-compose.override.example.yml` on a new server.
- Lint runs through the ESLint CLI over the whole repository.
- Upload variants keep the original's extension (`photo.jpg.w640.webp`), so
  originals with the same stem never share variants.

### Fixed

- Lists, quotes and the slash menu's list items in the editor (a duplicate
  `prosemirror-model` broke wrapping and list splits).
- A post with an image inside a sentence no longer fails hydration; inline
  code wraps instead of being clipped on narrow screens.
- RSS publish times match the JSON Feed and structured data.
- Keyboard focus no longer dims the other rows of hover lists; the hero name
  appears at once under reduced motion; the lightbox allows pinch-zoom.
- The vCard no longer falls back to the built-in name when the owner hides
  the name fields.
- `scripts/deploy.sh`: a live analytics write during the backup no longer
  aborts the deploy, `--force` on the same commit recreates the container,
  and a dropped connection during the build restores the server.

## [2.1.0] — 2026-10-13

Hardening and polish on top of 2.0.0, after two adversarial reviews (81
confirmed findings fixed) and an end-to-end check against a copy of the live
content store.

### Added

- **Admin Inbox** (`/admin/dashboard?tab=inbox`, Alt/⌃+5): every contact
  message is stored with whether it was emailed — readable and answerable
  (reply-by-email with the original quoted) even when SMTP is not
  configured. Read/unread, delete, unread badge, keyboard navigation.
  Site-wide daily and size caps; full-site backups include it and restores
  merge it without bringing deleted messages back.
- **CV Studio**: hidden-items panel (every hidden section/entry/field/bullet
  in EN and 中, jump-to and one-click Show), A4 CV / Website preview,
  alignment badges for linked EN↔中 lists, drafts that remember the version
  they were based on.
- **Admin-only reads with optimistic concurrency**: `GET /api/admin/cvdata`
  and `/api/admin/home` return the full documents with a version ETag;
  saves send `If-Match` and get 409 instead of silently overwriting newer
  edits. Public `GET /api/cvdata` / `/api/home` always return the pruned
  view, even to a signed-in admin.
- **Mobile CV reading mode** with a sticky Download PDF / EN·中文 / Copy link
  bar; **self-updating /now and /uses** built from the public CV, the
  currently-coding note, the latest writing and the curated stack.
- **Articles**: heading anchors, sticky table of contents, reading progress,
  prev/next and related items; **command palette 2.0** (fuzzy ranking,
  recents, in-page jumps, CV / theme / link actions).
- **On-demand revalidation**: saving a post, case study, page, CV or home
  page refreshes the affected static pages immediately; a boot-time warm-up
  (`scripts/warm-isr.mjs`) replaces the image's build-time pages before
  traffic arrives.
- Persistent header/footer across navigation, native view transitions,
  real PWA icons, AA-contrast accent tokens.

### Fixed

- `next build` failed with "database is locked" when the store did not exist
  yet (always the case in the Docker build).
- Next's `res.json()` replaced version ETags with a body hash, so every
  conditional save conflicted (`lib/http.ts` `sendVersionedJson`).
- Editors could load the pruned public CV after a session expired and save
  it back, deleting hidden content.
- A full-backup restore was undone on the next boot; public pages kept
  reading the old database after a restore; failed R2 writes could be
  reverted by the boot sync (`r2_pending` now repairs them).
- Hidden end dates showed as "Present", hidden expiry dates as "No Expiry";
  linked hide toggles could hit the wrong 中 entry; "Sync 中 ← EN" dropped
  中-only hides; duplicating a hidden entry made it public.
- Home page layout shift on phones (CLS 0.28–0.48 → none); light-mode dark
  flash; portals without the site fonts; `/cv` language not following client
  navigation; social cards blocked by robots.txt.

### Security

- Middleware refuses cross-site and non-JSON writes to admin/content APIs.
- Login: per-(email, IP) lockout plus a real site-wide throughput cap under
  attack, a signed known-device cookie for the owner, identical responses
  for unknown e-mail vs wrong password, async scrypt.
- Logout and password reset revoke every issued session.
- Client-IP headers trusted only from loopback and the container's default
  gateway unless `TRUSTED_PROXY_IPS` is set.
- Contact form: the sum is issued and verified by the server (HMAC bound to
  the single-use nonce); JSON-LD escaped against script breakout; one
  upload-name rule for upload, serving and backups.

## [2.0.0] — 2026-10-12

### Added

- **CV visibility at every level.** Hide / show any section (separately
  for the CV/PDF and for the website), any entry (degree, job, project,
  highlight, certificate…), any field (e.g. Education → GPA, phone,
  email) and any single bullet or tag. Hidden content is removed
  server-side from `/`, `/about`, `/cv` and the unauthenticated
  `GET /api/cvdata` (`lib/cvVisibility.ts`, `readPublicCvData()`).
- **CV Studio rewrite** (`components/Admin/CVEditorStudio.tsx`,
  `components/Admin/cvStudio/*`): schema-driven forms for every section
  (`lib/cvSections.ts`), per-field eye toggles, collapsible entry cards
  with drag-and-drop / duplicate / delete-with-undo, bullet editor
  (Enter = new bullet, Backspace on empty = remove, Alt+↑/↓ = move,
  multi-line paste), tag input, month pickers with "Present", one undo
  history for EN + 中 with typing coalesced per field, EN ↔ 中 linked
  visibility & structure, in-editor "Sync 中 ← EN" (undoable), local
  draft recovery, overwrite guard when the CV changed elsewhere, live
  fit-to-width A4 preview with page-break guides, responsive panes.
- **Patents** and **Languages** sections now render on the A4 CV and on
  `/about` (patents data existed but was never shown).
- `/cv?lang=zh` and `/cv?print=1`; language-aware dates (`Sep 2024` /
  `2024.09`), labels (`至今`, `预计`, `电话`, `邮箱`) and Chinese name order.
- Curated, grouped tech stack (`/api/stack`) instead of a raw dependency
  dump; copy button on MDX code blocks; real `G`-then-key navigation
  shortcuts in the command palette.

### Fixed

- Studio wrote Awards to `competitionAwardsList` and Extra Skills to
  `extraSkills` (the viewer reads `awards` / `points`), so those edits
  never appeared; missing editors for highlights, related skills,
  certificate details and patents.
- Header: menu missing on phones for 7 routes and on all tablets; sticky
  header never stuck; links did full page reloads; Dashboard / Logout
  never appeared (httpOnly cookie read from JS); the "last commit" pill
  wrapped onto three lines beside the full nav.
- Affiliation logos overflowed the page horizontally on tablets (fixed
  160px chips in a 4-column grid).
- Dashboard mounted every editor at once — the Studio's ⌘S/⌘Z fired on
  other tabs and editors overwrote each other's saves.
- Image uploads over ~750 KB failed (1 MB body limit); same-name uploads
  overwrote each other; PNG logos lost transparency.
- Home editor could wipe the home page if its load failed; upload
  callbacks reverted edits made during the upload.
- Raw JSON editor rewrote every curly quote in CV text on save.
- Version restore didn't snapshot the current state first; snapshot times
  were shown in the wrong timezone.
- Backup restore hung on a corrupt archive; non-atomic DB swap; local
  snapshot path check could be bypassed.
- MongoDB backup/restore used stale seed files instead of the live store
  (restores silently changed nothing); image restore allowed path
  traversal; connection string returned to the browser and cached in
  localStorage.
- MDX frontmatter dates crashed static generation; deleted posts could be
  resurrected from disk seeds or a stale R2 copy.
- Floating section nav targeted IDs that didn't exist; hero typewriter
  leaked timers; a `marginTop: 320px` hack triggered by any URL containing
  "edit"; About hero hook-order bug; syntax highlighting colours never
  applied.
- Blog/work editors: tags couldn't contain commas/spaces while typing,
  fields editable before load, "New" could overwrite an existing slug.

### Security

- Login lockout is now per (account, client IP) with a global breaker,
  so a stranger can no longer lock the admin out; failures against a
  wrong email no longer count. Admin email compared case-insensitively.
- One shared admin-auth helper with the JWT algorithm pinned (HS256).
- Rate limits keyed per route + IP (one endpoint can't exhaust another's
  budget), bounded memory, optional `TRUSTED_PROXY_IPS`.
- Contact nonces audience-scoped; contact form returns an error when a
  message could be neither mailed nor stored; mailer no longer logs
  bodies (reset links); SMTP timeouts.
- Reset-password validates token / password before consuming the token.
- Uploads: AVIF brand check, never overwrite, served with a sandboxing
  CSP; CSP drops unused hCaptcha / Binance hosts; production browser
  source maps disabled.

### Changed

- Docker: named volumes for `/app/data` and `/app/public/uploads` (admin
  password changes, history, backups and uploads now survive redeploys);
  `NEXT_PUBLIC_*` passed as build args; runtime state excluded from the
  build context. CI on Node 22. Boot-time R2 sync keeps newer local edits.
- GitHub proxies: fetch timeouts, shared in-flight requests, short
  failure caching, CDN cache headers; stats hide instead of showing zeros.
- Accessibility: skip link + `<main>` landmark, one `h1` per page,
  labelled icon buttons, accessible carousel (pause / play, keyboard,
  captions as alt text), combobox semantics in the command palette,
  `prefers-reduced-motion` honoured by every animation, AA contrast fixes.
- Removed 38 unused dependencies (MUI, FontAwesome, Formik, axios,
  next-auth, i18n stack, styled-components, luxon, …) and ~40 dead files;
  lint is at zero warnings.

## [Earlier]

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
