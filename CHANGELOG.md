# Changelog

All notable changes to this project will be documented in this file.

The format is loosely based on [Keep a Changelog](https://keepachangelog.com/),
and this project does not yet follow semver in earnest (single-deployment
portfolio CMS, no public package). Entries are grouped by release date.

## [Unreleased]

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
  PID limit in `docker-compose.yml`, asserted and exercised in CI.
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

### Changed

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
