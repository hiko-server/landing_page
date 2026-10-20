/**
 * ORCID works → publication entries (the CV Studio's "Import from ORCID").
 *
 * The ORCID public API (v3.0) answers `/{iD}/works` with *groups* of
 * work summaries: one group per work, one summary per source that asserted
 * it (Crossref, the owner, a publisher …), grouped by shared external ids.
 * `mapOrcidWorks` turns each group into one candidate: the summaries are
 * merged (the researcher's preferred version — the highest display index —
 * first; the first non-empty title, journal, URL and the most complete date
 * win), the DOI comes from the external ids
 * (`self` relationship first), the ORCID work type picks the venue type and
 * the status, and types that are not papers (patents, datasets, software,
 * …) are flagged so the Studio can leave them unticked.
 *
 * Summaries carry no authors or abstract; `/{iD}/works/{put-codes}` (the
 * bulk endpoint, up to 100 at a time) returns the full works, and
 * `applyWorkDetails` adds their contributors (authors, in order) and the
 * short description. `markDuplicates` compares the candidates with the
 * papers already on the CV (DOI first, then the normalised title);
 * `toPaperEntry` builds the stored entry exactly as a hand-entered paper.
 *
 * Pure and client-safe: the Studio runs the dedupe against its unsaved
 * document, the API route runs the mapping, tests run both on a fixture.
 */

import { normalizeDoi, sameDoi, doiUrl } from '../publications/doi'
import { PUB_DATE_RE, publicationHref } from '../publications/normalize'
import type { PublicationEntry, PublicationStatus, VenueType } from '../publications/types'

const isObject = (v: unknown): v is Record<string, any> => !!v && typeof v === 'object' && !Array.isArray(v)
const str = (v: unknown): string => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim() : typeof v === 'number' ? String(v) : '')
/** ORCID wraps most scalars as `{ value }`. */
const val = (v: unknown): string => (isObject(v) ? str(v.value) : str(v))

export type OrcidExternalId = {
  /** Lower-case id type: doi, arxiv, isbn, pmid, handle, … */
  type: string
  value: string
  url: string
  relationship: string
}

export type OrcidWorkCandidate = {
  /** ORCID's id of the summary the candidate is built on (the first of its group). */
  putCode: number
  title: string
  subtitle: string
  /** Journal / proceedings title as ORCID has it ('' when none). */
  venue: string
  /** The ORCID work type ("journal-article", "patent", …). */
  orcidType: string
  venueType: VenueType | ''
  status: PublicationStatus
  /** YYYY or YYYY-MM ('' when ORCID has no year). */
  date: string
  doi: string
  /** The work's page: an https:// link ('' when none or not usable). */
  url: string
  externalIds: OrcidExternalId[]
  /** False for a work type the Publications section is not for (patent, dataset, software, …). */
  paper: boolean
  /** Who asserted the work ("Crossref", the owner's name, …). */
  sources: string[]
  /** Authors in order, from the full work; [] until details are loaded or when ORCID has none. */
  authors: string[]
  /** The full work's short description, when any. */
  abstract: string
  /** True once the full work was read. */
  detailsLoaded: boolean
}

/** Candidates to map per record — the Studio shows a long list well, and ORCID's own page shows about this many at once. */
export const MAX_WORKS = 300
/** ORCID's bulk endpoint takes up to 100 put-codes per call. */
export const DETAILS_BATCH = 100

type TypeRule = { venueType: VenueType; status?: PublicationStatus }

/**
 * ORCID work types that are papers in the Publications section's sense
 * (its "Publications" and "Conference" groups, minus tools and web pages):
 * their venue type, and the status when it is not "published".
 */
const PAPER_TYPES: Readonly<Record<string, TypeRule>> = {
  'journal-article': { venueType: 'journal' },
  'book-review': { venueType: 'journal' },
  'magazine-article': { venueType: 'journal' },
  'newspaper-article': { venueType: 'journal' },
  'newsletter-article': { venueType: 'journal' },
  'journal-issue': { venueType: 'journal' },
  'conference-paper': { venueType: 'conference' },
  'conference-abstract': { venueType: 'conference' },
  'conference-poster': { venueType: 'conference' },
  'book-chapter': { venueType: 'book-chapter' },
  'encyclopedia-entry': { venueType: 'book-chapter' },
  'dictionary-entry': { venueType: 'book-chapter' },
  'dissertation-thesis': { venueType: 'thesis' },
  dissertation: { venueType: 'thesis' },
  'supervised-student-publication': { venueType: 'thesis' },
  preprint: { venueType: 'preprint', status: 'preprint' },
  'working-paper': { venueType: 'preprint', status: 'preprint' },
  book: { venueType: 'other' },
  'edited-book': { venueType: 'other' },
  report: { venueType: 'other' },
  translation: { venueType: 'other' },
  manual: { venueType: 'other' },
}

/** "conference-paper" → "conference paper" (for the Studio's type badge). */
export function orcidTypeLabel(type: string): string {
  return type.replace(/-/g, ' ').trim() || 'work'
}

/** An https:// link for an ORCID URL value: http is upgraded (publishers serve https), anything else refused. */
function webUrl(value: string): string {
  const v = value.replace(/^http:\/\//i, 'https://')
  return publicationHref(v) && /^https:\/\//i.test(publicationHref(v)) ? publicationHref(v) : ''
}

function externalIds(node: unknown): OrcidExternalId[] {
  const list = isObject(node) && Array.isArray(node['external-id']) ? node['external-id'] : []
  const out: OrcidExternalId[] = []
  for (const e of list) {
    if (!isObject(e)) continue
    const type = str(e['external-id-type']).toLowerCase()
    const value = str(e['external-id-value'])
    if (!type || !value) continue
    out.push({ type, value, url: webUrl(val(e['external-id-url'])), relationship: str(e['external-id-relationship']).toLowerCase() })
  }
  return out
}

function uniqueIds(ids: OrcidExternalId[]): OrcidExternalId[] {
  const seen = new Set<string>()
  return ids.filter((e) => {
    const k = `${e.type}|${e.value.toLowerCase()}`
    if (seen.has(k)) return false
    seen.add(k)
    return true
  })
}

/** The DOI of a work: a `self` DOI first, else any DOI; normalised. */
function doiOf(ids: OrcidExternalId[]): string {
  const dois = ids.filter((e) => e.type === 'doi')
  const self = dois.find((e) => e.relationship === 'self' || !e.relationship) || dois[0]
  return self ? normalizeDoi(self.value) : ''
}

/** YYYY-MM / YYYY from ORCID's `publication-date` ({ year: { value }, month: { value } }). */
function dateOf(node: unknown): string {
  if (!isObject(node)) return ''
  const y = val(node.year)
  const m = val(node.month).padStart(2, '0')
  if (!/^\d{4}$/.test(y)) return ''
  const date = /^(0[1-9]|1[0-2])$/.test(m) ? `${y}-${m}` : y
  return PUB_DATE_RE.test(date) ? date : ''
}

/**
 * A summary's rank in its group: ORCID marks the version the researcher
 * prefers with the HIGHEST display index (unranked API additions are 1), so
 * the merge reads summaries from the highest index down; a missing index
 * ranks last, and ties keep ORCID's order (Array#sort is stable).
 */
const displayIndex = (s: Record<string, any>) => {
  const raw = str(s['display-index'])
  const n = raw === '' ? Number.NaN : Number(raw)
  return Number.isFinite(n) ? n : Number.NEGATIVE_INFINITY
}

function candidateOf(group: Record<string, any>): OrcidWorkCandidate | null {
  const summaries = (Array.isArray(group['work-summary']) ? group['work-summary'] : []).filter(isObject).sort((a, b) => displayIndex(b) - displayIndex(a))
  if (!summaries.length) return null
  const first = (pick: (s: Record<string, any>) => string) => {
    for (const s of summaries) {
      const v = pick(s)
      if (v) return v
    }
    return ''
  }
  const title = first((s) => val(isObject(s.title) ? s.title.title : undefined))
  if (!title) return null
  const putCode = Number(str(summaries[0]['put-code']))
  if (!Number.isInteger(putCode) || putCode < 0) return null
  const dates = summaries.map((s) => dateOf(s['publication-date'])).filter(Boolean)
  const date = dates.find((d) => d.length === 7) || dates[0] || ''
  // The preferred version's identifiers as it writes them, then the other versions', then the group's union.
  const ids = uniqueIds([...summaries.flatMap((s) => externalIds(s['external-ids'])), ...externalIds(group['external-ids'])])
  const doi = doiOf(ids)
  const orcidType = first((s) => str(s.type).toLowerCase())
  const rule = PAPER_TYPES[orcidType]
  let url = first((s) => webUrl(val(s.url)))
  // The work's "URL" is often just its DOI link again — the DOI field already carries that.
  if (url && doi && url.replace(/\/$/, '').toLowerCase() === doiUrl(doi).toLowerCase()) url = ''
  if (!url) {
    const arxiv = ids.find((e) => e.type === 'arxiv')
    const handle = ids.find((e) => e.type === 'handle')
    url = (arxiv && (arxiv.url || `https://arxiv.org/abs/${encodeURIComponent(arxiv.value.replace(/^arxiv:/i, ''))}`)) || (handle && (handle.url || `https://hdl.handle.net/${handle.value}`)) || ''
    url = webUrl(url)
  }
  const sources = Array.from(new Set(summaries.map((s) => val(isObject(s.source) ? s.source['source-name'] : undefined)).filter(Boolean)))
  return {
    putCode,
    title,
    subtitle: first((s) => val(isObject(s.title) ? s.title.subtitle : undefined)),
    venue: first((s) => val(s['journal-title'])),
    orcidType,
    venueType: rule ? rule.venueType : 'other',
    status: rule?.status || 'published',
    date,
    doi,
    url,
    externalIds: ids,
    paper: !!rule,
    sources,
    authors: [],
    abstract: '',
    detailsLoaded: false,
  }
}

/**
 * The candidates of a `/works` answer, in ORCID's order (at most MAX_WORKS).
 * null when `json` does not have the shape of that answer (a `group` list),
 * so the caller can tell "malformed" from "no public works" ([]).
 */
export function mapOrcidWorks(json: unknown): OrcidWorkCandidate[] | null {
  if (!isObject(json) || !Array.isArray(json.group)) return null
  const out: OrcidWorkCandidate[] = []
  for (const g of json.group) {
    if (!isObject(g)) continue
    const c = candidateOf(g)
    if (c) out.push(c)
    if (out.length >= MAX_WORKS) break
  }
  return out
}

/**
 * Contributor roles that name an author of the work: none given, ORCID's
 * `author`, or a CRediT role (http://credit.niso.org/contributor-roles/…,
 * which ORCID 3.0 also accepts — CRediT describes what each AUTHOR did).
 * Editors, translators, assignees, investigators and staff are left out.
 */
function isAuthorRole(role: string): boolean {
  const r = role.trim().toLowerCase()
  return !r || r === 'author' || /^https?:\/\/credit\.niso\.org\/contributor-roles\//.test(r)
}

/** Contributor names in author order from a full work's `contributors`; roles other than author are left out. */
function authorsOf(work: Record<string, any>): string[] {
  const list = isObject(work.contributors) && Array.isArray(work.contributors.contributor) ? work.contributors.contributor : []
  const rows: Array<{ name: string; first: boolean }> = []
  for (const c of list) {
    if (!isObject(c)) continue
    const attrs = isObject(c['contributor-attributes']) ? c['contributor-attributes'] : {}
    if (!isAuthorRole(str(attrs['contributor-role']))) continue
    const name = val(c['credit-name'])
    if (!name) continue
    rows.push({ name, first: str(attrs['contributor-sequence']).toLowerCase() === 'first' })
  }
  // A "first" author is first; the rest keep ORCID's order. Names are de-duplicated.
  const ordered = [...rows.filter((r) => r.first), ...rows.filter((r) => !r.first)].map((r) => r.name)
  return Array.from(new Set(ordered))
}

/**
 * Add the full works of a bulk answer (`{ bulk: [{ work } | { error }] }`)
 * to the matching candidates: authors, the short description, and any
 * venue / date / URL the summaries lacked. Returns how many were applied;
 * a malformed answer applies nothing.
 */
export function applyWorkDetails(candidates: readonly OrcidWorkCandidate[], json: unknown): { candidates: OrcidWorkCandidate[]; loaded: number } {
  const bulk = isObject(json) && Array.isArray(json.bulk) ? json.bulk : []
  const byPutCode = new Map<number, Record<string, any>>()
  for (const item of bulk) {
    const work = isObject(item) && isObject(item.work) ? item.work : null
    if (!work) continue
    const code = Number(str(work['put-code']))
    if (Number.isInteger(code)) byPutCode.set(code, work)
  }
  let loaded = 0
  const next = candidates.map((c) => {
    const work = byPutCode.get(c.putCode)
    if (!work) return c
    loaded++
    const abstract = typeof work['short-description'] === 'string' ? work['short-description'].replace(/\r\n?/g, '\n').trim() : ''
    return {
      ...c,
      authors: authorsOf(work),
      abstract,
      venue: c.venue || val(work['journal-title']),
      date: c.date || dateOf(work['publication-date']),
      url: c.url || webUrl(val(work.url)),
      detailsLoaded: true,
    }
  })
  return { candidates: next, loaded }
}

/** Title key for duplicate detection: case-, width-, punctuation- and space-insensitive. */
export function titleKey(title: unknown): string {
  return str(title)
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '')
}

export type ExistingPaper = { index: number; title: string; doi: string }

/** The papers of a Publications section as the deduper needs them (every entry, hidden ones included — a hidden paper is still on the CV). */
export function existingPapers(papers: unknown): ExistingPaper[] {
  return (Array.isArray(papers) ? papers : []).map((p, index) => ({ index, title: isObject(p) ? str(p.title) : '', doi: isObject(p) ? normalizeDoi(p.doi) : '' }))
}

export type DedupedCandidate = OrcidWorkCandidate & {
  /** The CV paper this work already is (by DOI, else by title), or null when it is new. */
  existing: ExistingPaper | null
}

/** Mark each candidate that is already on the CV: the same DOI, else the same normalised title. */
export function markDuplicates(candidates: readonly OrcidWorkCandidate[], existing: readonly ExistingPaper[]): DedupedCandidate[] {
  return candidates.map((c) => {
    const byDoi = c.doi ? existing.find((e) => e.doi && sameDoi(e.doi, c.doi)) : undefined
    const key = titleKey(c.title)
    const byTitle = key ? existing.find((e) => titleKey(e.title) === key) : undefined
    return { ...c, existing: byDoi || byTitle || null }
  })
}

/** The stored paper for a candidate — the same shape `blank()` gives a hand-entered paper, filled with what ORCID knows. */
export function toPaperEntry(c: OrcidWorkCandidate): PublicationEntry & Record<string, unknown> {
  return {
    title: c.subtitle ? `${c.title}: ${c.subtitle}` : c.title,
    authors: [...c.authors],
    venue: c.venue,
    venueType: c.venueType,
    status: c.status,
    date: c.date,
    volume: '',
    issue: '',
    pages: '',
    publisher: '',
    doi: c.doi,
    url: c.url,
    pdfUrl: '',
    codeUrl: '',
    slidesUrl: '',
    abstract: c.abstract,
    keywords: [],
    award: '',
  }
}
