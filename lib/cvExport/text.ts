/**
 * Plain-text CV (/cv.txt, /cv/zh.txt) from the document model: for job
 * portals that only take pasted text. No hard wrapping (form fields reflow),
 * "- " bullets, full https:// URLs so pasted links stay clickable, one blank
 * line between entries. Pure; prints only model strings plus fixed labels.
 *
 * A paper prints as a citation in lines: title, authors (a hidden co-author
 * as "…"), venue line, date, "Status: …" for anything not yet published,
 * award, then the DOI as its https://doi.org/ URL and the other links.
 * The owner's ORCID iD is a labelled line, "ORCID: https://orcid.org/…".
 */

import type { CvLang } from '../cvVisibility'
import type { CvDocModel, ModelEntry, ModelPublication, ModelSection } from './model'

const LABELS: Record<CvLang, { phone: string; email: string; skills: string; summary: string; status: string; sep: string; listSep: string }> = {
  en: { phone: 'Phone', email: 'Email', skills: 'Skills', summary: 'SUMMARY', status: 'Status', sep: ': ', listSep: ', ' },
  zh: { phone: '电话', email: '邮箱', skills: '技能', summary: '简介', status: '状态', sep: '：', listSep: '、' },
}

/** Display columns of a string (CJK and full-width forms count 2). */
export function displayWidth(s: string): number {
  let n = 0
  for (const ch of s) n += /[ᄀ-ᅟ⺀-꓏가-힣豈-﫿︰-﹏＀-｠￠-￦]/.test(ch) ? 2 : 1
  return n
}

function heading(title: string): string[] {
  return [title, '-'.repeat(Math.min(48, Math.max(3, displayWidth(title))))]
}

function entryLines(e: ModelEntry, lang: CvLang): string[] {
  const L = LABELS[lang]
  const lines: string[] = []
  if (e.title) lines.push(e.title)
  if (e.subtitle) lines.push(e.subtitleHref ? `${e.subtitle} (${e.subtitleHref})` : e.subtitle)
  const meta = [e.date, e.place].filter(Boolean).join(' | ')
  if (meta) lines.push(meta)
  if (e.note) lines.push(e.note)
  if (e.text) lines.push(e.text)
  for (const b of e.bullets) {
    if (b.text) lines.push(`- ${b.text}`)
    for (const s of b.sub) lines.push(`  - ${s}`)
  }
  if (e.tags.length) lines.push(`${L.skills}${L.sep}${e.tags.join(L.listSep)}`)
  for (const link of e.links) lines.push(`${link.label}${L.sep}${link.href}`)
  return lines
}

function publicationLines(p: ModelPublication, lang: CvLang): string[] {
  const L = LABELS[lang]
  const lines: string[] = [p.title]
  if (p.authors.length) lines.push(p.authors.map((a) => a.name).join(', '))
  const tail = [p.details, p.publisher].filter(Boolean).join('. ')
  if (p.venue || tail) lines.push(p.venue && tail ? `${p.venue}${p.details ? ', ' : '. '}${tail}` : p.venue || tail)
  if (p.date) lines.push(p.date)
  if (p.status) lines.push(`${L.status}${L.sep}${p.status}`)
  if (p.award) lines.push(p.award)
  for (const link of p.links) lines.push(link.key === 'doi' ? link.href : `${link.label}${L.sep}${link.href}`)
  return lines
}

function sectionLines(s: ModelSection, lang: CvLang): string[] {
  const L = LABELS[lang]
  const lines = heading(s.title)
  if (s.kind === 'entries') {
    s.entries.forEach((e, i) => {
      if (i) lines.push('')
      lines.push(...entryLines(e, lang))
    })
  } else if (s.kind === 'publications') {
    s.items.forEach((p, i) => {
      if (i) lines.push('')
      lines.push(...publicationLines(p, lang))
    })
  } else if (s.kind === 'statement') {
    if (s.text) lines.push(s.text)
    for (const p of s.items) lines.push(`- ${p}`)
  } else if (s.kind === 'quotes') {
    s.items.forEach((q, i) => {
      if (i) lines.push('')
      lines.push(lang === 'zh' ? `「${q.quote}」` : `“${q.quote}”`)
      const who = [q.name, q.credit].filter(Boolean).join(', ')
      lines.push(q.href ? `— ${who} (${q.href})` : `— ${who}`)
    })
  } else if (s.kind === 'skills') {
    for (const c of s.core) lines.push(c.name && c.level ? `${c.name}${L.sep}${c.level}` : c.name || c.level)
    for (const g of s.groups) {
      const items = g.items.join(L.listSep)
      lines.push(g.name && items ? `${g.name}${L.sep}${items}` : g.name || items)
    }
  } else {
    for (const p of s.items) lines.push(`- ${p}`)
  }
  return lines
}

export function renderCvText(model: CvDocModel): string {
  const L = LABELS[model.lang]
  const out: string[] = []
  const name = [model.name, model.nameAside].filter(Boolean).join(' ')
  if (name) out.push(name)
  const c = model.contacts
  if (c.location) out.push(c.location)
  const reach = [c.phone ? `${L.phone}${L.sep}${c.phone}` : '', c.email ? `${L.email}${L.sep}${c.email}` : ''].filter(Boolean)
  if (reach.length) out.push(reach.join(' | '))
  // GitHub / LinkedIn with the website; the ORCID iD on a labelled line of its own.
  const web = [c.website ? c.website.href || c.website.text : '', ...c.profiles.filter((p) => p.kind !== 'orcid').map((p) => p.href)].filter(Boolean)
  if (web.length) out.push(web.join(' | '))
  for (const p of c.profiles) if (p.kind === 'orcid') out.push(`${p.label}${L.sep}${p.href}`)
  for (const line of model.headerLines) out.push(`${line.label}${L.sep}${line.value}`)
  if (model.summary) {
    if (out.length) out.push('')
    out.push(...heading(L.summary), model.summary)
  }
  for (const s of model.sections) {
    if (out.length) out.push('')
    out.push(...sectionLines(s, model.lang))
  }
  const footer = [model.updatedLabel, model.canonical].filter(Boolean).join(' · ')
  if (footer) out.push('', '--', footer)
  return `${out.join('\n')}\n`
}
