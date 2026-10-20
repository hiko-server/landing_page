/**
 * Skill traceability: for every skill the public CV lists, where it is
 * evidenced — the roles, projects, awards, patents and papers on the same CV
 * page, the published case studies and the published posts. Pure;
 * unit-tested.
 *
 * Skills come from the CV's own Skills section (core skills, technical
 * groups) and the roles' related skills, de-duplicated ignoring case and
 * parenthesised notes ("MongoDB (NoSQL)" = "MongoDB").
 *
 * Matching is deliberately strict:
 *   - tags (a role's related skills, a paper's keywords, a case study's
 *     `tech`, a post's `tags`) match by the same normalised key or an alias
 *     ("React.js" = "React");
 *   - free text (titles, descriptions, highlights) matches a skill's terms at
 *     word boundaries only: "C" never matches "CUHK" or "C++", "Java" never
 *     matches "JavaScript", "Git" never matches "GitHub". Terms of up to three
 *     letters are case-sensitive ("AI", "ML", "IoT"), and one-letter or
 *     ambiguous names ("Go", "R", "C") are matched as tags only;
 *   - Chinese terms match as substrings (Chinese has no word spaces).
 * Certificates and education are never counted as evidence. Input is the
 * page's public, CV-audience data, so a hidden entry can never be cited; a
 * paper counts only when it renders on the page (a title and a real status,
 * lib/publications), with its visible keywords, title and abstract.
 */

import type { CvLang, CvSectionLike } from './cvVisibility'
import { bullets, cvEntryAnchor, field, indexedList, list } from '../components/CVViewerPage/fields'
import { publicPublications } from './publications/normalize'
import { PUBLICATIONS_SECTION } from './publications/types'

import type { EvidenceKind } from './skillEvidenceLabels'

// The kinds and their labels live in a module of their own, so the page
// component that prints them does not ship the matcher (and the
// publications code it reads papers with).
export { EVIDENCE_KIND_LABELS, type EvidenceKind } from './skillEvidenceLabels'

export type EvidenceItem = {
  kind: EvidenceKind
  /** What is cited ("CTO & Co-Founder — WeGreen AI", a case-study title, …). */
  label: string
  /** Same-page anchor (#cv-workExperience-0) or same-site path (/work/swcs). */
  href: string
}

export type SkillEvidence = {
  /** Normalised key ("next.js", "mongodb"). */
  key: string
  /** Display name, as the CV first writes it. */
  name: string
  /** Element id of the skill's evidence row ("skill-next-js"). */
  id: string
  items: EvidenceItem[]
}

/** A published post or case study as evidence needs it. */
export type EvidenceDoc = { slug: string; title: string; description?: string; tags?: readonly string[] }

const KIND_ORDER: EvidenceKind[] = ['role', 'project', 'award', 'patent', 'paper', 'caseStudy', 'post']

/** Alias groups (normalised keys). Any member names the same skill. */
const ALIASES: readonly (readonly string[])[] = [
  ['react', 'react.js', 'reactjs'],
  ['next.js', 'nextjs'],
  ['node.js', 'nodejs'],
  ['vue', 'vue.js', 'vuejs'],
  ['nestjs', 'nest.js'],
  ['express', 'express.js', 'expressjs'],
  ['javascript', 'js', 'ecmascript'],
  ['typescript'],
  ['mongodb', 'mongo', 'mongodb atlas'],
  ['postgresql', 'postgres'],
  ['kubernetes', 'k8s'],
  ['machine learning', 'ml'],
  ['deep learning'],
  ['ai', 'artificial intelligence'],
  ['iot', 'internet of things'],
  ['c++', 'cpp'],
  ['c#', 'csharp'],
  ['golang', 'go'],
  ['html5', 'html'],
  ['css3', 'css'],
  ['restful apis', 'restful api', 'rest api', 'rest apis', 'restful'],
  ['openapi', 'swagger'],
  ['shell scripting', 'shell scripts', 'bash'],
  ['nginx'],
  ['fastapi'],
  ['tensorflow'],
  ['pytorch'],
  ['docker'],
]

/** Names only ever matched as tags (common words or single letters in prose). */
const TAG_ONLY = new Set(['go', 'r', 'c', 'd', 'v', 'swift', 'rust', 'dart', 'make', 'spring', 'express'])

/** "MongoDB (NoSQL)" / "MongoDB（NoSQL）" → "mongodb"; case-, width- and space-insensitive. */
export function skillKey(name: unknown): string {
  if (typeof name !== 'string') return ''
  return name
    .normalize('NFKC')
    .replace(/\([^)]*\)/g, ' ')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/[.。]+$/, '')
    .trim()
}

/** Element id of a skill row: "skill-next-js", "skill-c-plus-plus", "skill-机器学习". */
export function skillId(key: string): string {
  const slug = key
    .replace(/\+/g, '-plus')
    .replace(/#/g, '-sharp')
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '')
  return `skill-${slug || 'item'}`
}

const aliasIndex = new Map<string, readonly string[]>()
for (const group of ALIASES) for (const k of group) aliasIndex.set(k, group)

/** Every normalised key that names the same skill as `key`. */
export function aliasKeys(key: string): string[] {
  const out = new Set<string>([key])
  for (const k of aliasIndex.get(key) || []) out.add(k)
  // "HTML5/CSS3", "OpenAPI/Swagger": each single-word part is a name too.
  if (key.includes('/') && !/\s/.test(key)) {
    for (const part of key.split('/')) {
      if (part.length >= 2) {
        out.add(part)
        for (const k of aliasIndex.get(part) || []) out.add(k)
      }
    }
  }
  return Array.from(out)
}

const CJK = /[㐀-鿿豈-﫿]/
const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** A matcher for free text: word-bounded for Latin terms, substring for Chinese ones. */
function termMatcher(term: string, original?: string): ((text: string) => boolean) | null {
  const t = term.trim()
  if (!t || TAG_ONLY.has(t)) return null
  if (CJK.test(t)) return t.length >= 2 ? (text) => text.includes(t) : null
  if (t.length < 2) return null
  // Short terms keep the case the CV writes ("AI", "IoT"), so "ai" in prose is not a hit.
  const caseSensitive = t.replace(/[^a-z0-9]/gi, '').length <= 3
  const shown = caseSensitive ? (original && skillKey(original) === t ? original.replace(/\([^)]*\)/g, '').trim() : t.toUpperCase()) : t
  const re = new RegExp(`(?<![A-Za-z0-9_])${escapeRe(shown)}(?![A-Za-z0-9_+#])`, caseSensitive ? '' : 'i')
  return (text) => re.test(text)
}

type Skill = { key: string; name: string; keys: Set<string>; matchers: Array<(t: string) => boolean> }

function makeSkill(name: string): Skill | null {
  const key = skillKey(name)
  if (!key) return null
  const keys = new Set(aliasKeys(key))
  const matchers: Array<(t: string) => boolean> = []
  for (const k of keys) {
    const m = termMatcher(k, k === key ? name : undefined)
    if (m) matchers.push(m)
  }
  return { key, name: name.replace(/\s*[(（][^)）]*[)）]\s*$/, '').trim() || name.trim(), keys, matchers }
}

/** The CV's skills in CV order: core skills, technical groups, then roles' related skills. */
export function cvSkills(sections: readonly CvSectionLike[] | null | undefined): Array<{ key: string; name: string }> {
  const all = Array.isArray(sections) ? sections : []
  const skill = all.find((s) => s?.sessionName === 'skill')
  const work = all.find((s) => s?.sessionName === 'workExperience')
  const names = [
    ...list(skill, 'languages').map((l) => field(l, 'language')),
    ...list(skill, 'technical').flatMap((g) => bullets(g, 'description')),
    ...list(work, 'experiences').flatMap((e) => bullets(e, 'relatedSkills')),
  ]
  const seen = new Set<string>()
  const out: Array<{ key: string; name: string }> = []
  for (const n of names) {
    const s = makeSkill(n)
    if (!s || seen.has(s.key)) continue
    seen.add(s.key)
    out.push({ key: s.key, name: s.name })
  }
  return out
}

type Source = { kind: EvidenceKind; label: string; href: string; tags: string[]; text: string[] }

function cvSources(sections: readonly CvSectionLike[], lang: CvLang): Source[] {
  const find = (n: string) => sections.find((s) => s?.sessionName === n)
  const featureText = (node: unknown) =>
    list(node, 'features').flatMap((f) => [field(f, 'description'), ...bullets(f, 'furtherExplanation')])
  const dash = lang === 'zh' ? ' · ' : ' — '
  const out: Source[] = []
  for (const { item: e, index } of indexedList(find('workExperience'), 'experiences')) {
    const title = field(e, 'jobTitle')
    const company = field(e, 'companyName')
    if (!title && !company) continue
    out.push({
      kind: 'role',
      label: [title, company].filter(Boolean).join(dash),
      href: `#${cvEntryAnchor('workExperience', index)}`,
      tags: bullets(e, 'relatedSkills'),
      text: [title, field(e, 'jobDescription'), ...featureText(e)],
    })
  }
  for (const { item: p, index } of indexedList(find('project'), 'projectExperience')) {
    const title = field(p, 'title')
    if (!title) continue
    out.push({ kind: 'project', label: title, href: `#${cvEntryAnchor('project', index)}`, tags: [], text: [title, field(p, 'description'), ...featureText(p)] })
  }
  for (const { item: a, index } of indexedList(find('competitionAwards'), 'awards')) {
    const title = field(a, 'contestName') || field(a, 'award')
    if (!title) continue
    out.push({
      kind: 'award',
      label: title,
      href: `#${cvEntryAnchor('competitionAwards', index)}`,
      tags: [],
      text: [field(a, 'contestName'), field(a, 'award'), ...bullets(a, 'description')],
    })
  }
  for (const { item: p, index } of indexedList(find('patents'), 'patentExperience')) {
    const title = field(p, 'title')
    if (!title) continue
    out.push({ kind: 'patent', label: title, href: `#${cvEntryAnchor('patents', index)}`, tags: [], text: [title, ...bullets(p, 'patents')] })
  }
  // Papers at the anchors the sheet gives them (the index among visible papers).
  for (const p of publicPublications(sections)) {
    out.push({ kind: 'paper', label: p.title, href: `#${cvEntryAnchor(PUBLICATIONS_SECTION, p.index)}`, tags: p.keywords, text: [p.title, p.abstract] })
  }
  return out
}

function docSources(kind: 'caseStudy' | 'post', docs: readonly EvidenceDoc[] | null | undefined): Source[] {
  return (Array.isArray(docs) ? docs : [])
    .filter((d) => d && /^[a-z0-9][a-z0-9-_]*$/.test(String(d.slug || '')) && typeof d.title === 'string' && d.title.trim())
    .map((d) => ({
      kind,
      label: d.title.trim(),
      href: `/${kind === 'post' ? 'blog' : 'work'}/${d.slug}`,
      tags: Array.isArray(d.tags) ? (d.tags as readonly unknown[]).filter((t): t is string => typeof t === 'string') : [],
      text: [d.title, d.description || ''],
    }))
}

/**
 * Evidence for every skill of the page's public CV that has any, in CV
 * order. Skills without evidence are left out (no empty rows, no "0").
 */
export function buildSkillEvidence(
  sections: readonly CvSectionLike[] | null | undefined,
  opts: { lang: CvLang; works?: readonly EvidenceDoc[] | null; posts?: readonly EvidenceDoc[] | null },
): SkillEvidence[] {
  const all = Array.isArray(sections) ? sections : []
  const sources = [...cvSources(all, opts.lang), ...docSources('caseStudy', opts.works), ...docSources('post', opts.posts)]
  const ids = new Set<string>()
  const out: SkillEvidence[] = []
  for (const { name } of cvSkills(all)) {
    const skill = makeSkill(name)
    if (!skill) continue
    const items: EvidenceItem[] = []
    const seen = new Set<string>()
    for (const src of sources) {
      const tagHit = src.tags.some((t) => skill.keys.has(skillKey(t)) || aliasKeys(skillKey(t)).some((k) => skill.keys.has(k)))
      const textHit = !tagHit && src.text.some((t) => t && skill.matchers.some((m) => m(t)))
      if (!tagHit && !textHit) continue
      if (seen.has(src.href)) continue
      seen.add(src.href)
      items.push({ kind: src.kind, label: src.label, href: src.href })
    }
    if (!items.length) continue
    items.sort((a, b) => KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind))
    let id = skillId(skill.key)
    for (let n = 2; ids.has(id); n++) id = `${skillId(skill.key)}-${n}`
    ids.add(id)
    out.push({ key: skill.key, name: skill.name, id, items })
  }
  return out
}

/** Skill key → evidence row id, for linking skill names on the sheet and in the Reading view. */
export function evidenceIdIndex(evidence: readonly SkillEvidence[] | null | undefined): Map<string, string> {
  const map = new Map<string, string>()
  for (const e of Array.isArray(evidence) ? evidence : []) {
    for (const k of aliasKeys(e.key)) if (!map.has(k)) map.set(k, e.id)
    map.set(e.key, e.id)
  }
  return map
}

/** The evidence row id for a skill name as written on the CV, or ''. */
export function evidenceIdFor(name: unknown, index: Map<string, string>): string {
  const key = skillKey(name)
  return (key && index.get(key)) || ''
}

/**
 * Every skill name as the page writes it (core skills, group items, roles'
 * related skills) → the id of its evidence row, for skills that have one.
 * Computed on the server so the page links names without shipping the
 * matcher.
 */
export function skillLinkMap(sections: readonly CvSectionLike[] | null | undefined, evidence: readonly SkillEvidence[] | null | undefined): Record<string, string> {
  const index = evidenceIdIndex(evidence)
  const out: Record<string, string> = {}
  if (!index.size) return out
  const all = Array.isArray(sections) ? sections : []
  const skill = all.find((s) => s?.sessionName === 'skill')
  const work = all.find((s) => s?.sessionName === 'workExperience')
  const names = [
    ...list(skill, 'languages').map((l) => field(l, 'language')),
    ...list(skill, 'technical').flatMap((g) => bullets(g, 'description')),
    ...list(work, 'experiences').flatMap((e) => bullets(e, 'relatedSkills')),
  ]
  for (const name of names) {
    const id = evidenceIdFor(name, index)
    if (id) out[name] = id
  }
  return out
}
