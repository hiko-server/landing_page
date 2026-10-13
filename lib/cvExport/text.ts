/**
 * Plain-text CV (/cv.txt, /cv/zh.txt) from the document model: for job
 * portals that only take pasted text. No hard wrapping (form fields reflow),
 * "- " bullets, full https:// URLs so pasted links stay clickable, one blank
 * line between entries. Pure; prints only model strings plus fixed labels.
 */

import type { CvLang } from '../cvVisibility'
import type { CvDocModel, ModelEntry, ModelSection } from './model'

const LABELS: Record<CvLang, { phone: string; email: string; skills: string; summary: string; sep: string; listSep: string }> = {
  en: { phone: 'Phone', email: 'Email', skills: 'Skills', summary: 'SUMMARY', sep: ': ', listSep: ', ' },
  zh: { phone: '电话', email: '邮箱', skills: '技能', summary: '简介', sep: '：', listSep: '、' },
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

function sectionLines(s: ModelSection, lang: CvLang): string[] {
  const L = LABELS[lang]
  const lines = heading(s.title)
  if (s.kind === 'entries') {
    s.entries.forEach((e, i) => {
      if (i) lines.push('')
      lines.push(...entryLines(e, lang))
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
  const web = [c.website ? c.website.href || c.website.text : '', ...c.profiles.map((p) => p.href)].filter(Boolean)
  if (web.length) out.push(web.join(' | '))
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
