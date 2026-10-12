/**
 * Index of everything the owner has hidden, across both languages — the
 * data behind the Studio's "Hidden items" panel. Pure, so it is unit-tested
 * and agrees with countHidden() / the public pruning in lib/cvVisibility.
 */

import { hiddenIndices, isSectionOnCv, isSectionOnWebsite, type CvLang, type CvPath } from '../../../lib/cvVisibility'
import { SECTION_BY_NAME, type FieldDef, type ListDef } from '../../../lib/cvSections'
import type { Doc } from './docOps'

export type HiddenKind = 'section-cv' | 'section-web' | 'entry' | 'field' | 'list' | 'item'

export type HiddenRow = {
  /** Unique within one document snapshot. */
  id: string
  lang: CvLang
  kind: HiddenKind
  sectionName: string
  sectionIdx: number
  /** Node that carries the flag (section or entry path). */
  nodePath: CvPath
  /** Hidden field / list key, or the bullet list holding a hidden item. */
  field?: string
  /** Index of a hidden bullet / tag. */
  index?: number
  /** Human trail to the node: ["Education", "HKMU"]. */
  crumbs: string[]
  /** What is hidden: "GPA", a degree title, "Points #2". */
  label: string
  /** Short preview of the hidden value. */
  preview: string
  /** Path of the editor element to jump to (matches data-cvpath in the editor). */
  targetPath: CvPath
}

const isPlainObject = (v: unknown): v is Record<string, any> => !!v && typeof v === 'object' && !Array.isArray(v)

const META = new Set(['isVisible', 'showOnWebsite', 'hiddenFields', 'hiddenItems', 'redacted'])

export function truncate(s: string, n = 60): string {
  const t = s.replace(/\s+/g, ' ').trim()
  return t.length > n ? `${t.slice(0, n - 1)}…` : t
}

/** "companyURL" → "Company URL" for keys that have no registry label. */
export function humanizeKey(key: string): string {
  const spaced = key.replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/[_-]+/g, ' ')
  return spaced.charAt(0).toUpperCase() + spaced.slice(1)
}

function previewOf(v: unknown): string {
  if (typeof v === 'string') return truncate(v)
  if (typeof v === 'number' || typeof v === 'boolean') return String(v)
  if (Array.isArray(v)) {
    const strings = v.filter((x) => typeof x === 'string' && x.trim())
    if (strings.length === v.length && strings.length) return truncate(strings.join(', '))
    return v.length ? `${v.length} item${v.length === 1 ? '' : 's'}` : ''
  }
  return ''
}

type Shape = { fields?: FieldDef[]; lists?: ListDef[] }

function labelFor(shape: Shape, key: string): string {
  return shape.fields?.find((f) => f.key === key)?.label || shape.lists?.find((l) => l.key === key)?.label || humanizeKey(key)
}

/** Every hidden section switch, entry, field, list and bullet in both languages, in document order. */
export function collectHidden(doc: Doc): HiddenRow[] {
  const rows: HiddenRow[] = []
  for (const lang of ['en', 'zh'] as CvLang[]) {
    const sections = Array.isArray(doc[lang]) ? doc[lang] : []
    sections.forEach((section, sectionIdx) => {
      if (!isPlainObject(section)) return
      const sectionName = String(section.sessionName || '')
      const def = SECTION_BY_NAME[sectionName]
      const sectionLabel = def?.label || sectionName || `Section ${sectionIdx + 1}`
      const base = { lang, sectionName, sectionIdx }
      const push = (r: Omit<HiddenRow, 'id' | 'lang' | 'sectionName' | 'sectionIdx'>) =>
        rows.push({ ...base, ...r, id: `${lang}:${r.kind}:${r.targetPath.join('.')}` })

      if (!isSectionOnCv(section)) {
        push({ kind: 'section-cv', nodePath: [sectionIdx], crumbs: [], label: sectionLabel, preview: 'Off the CV / PDF', targetPath: [sectionIdx, 'cv'] })
      }
      if (!isSectionOnWebsite(section)) {
        push({ kind: 'section-web', nodePath: [sectionIdx], crumbs: [], label: sectionLabel, preview: 'Off the website', targetPath: [sectionIdx, 'web'] })
      }

      const walk = (node: Record<string, any>, path: CvPath, shape: Shape, crumbs: string[]) => {
        const hiddenFields: string[] = Array.isArray(node.hiddenFields) ? node.hiddenFields.filter((f: unknown) => typeof f === 'string') : []
        for (const field of hiddenFields) {
          const isList = !!shape.lists?.some((l) => l.key === field) || (Array.isArray(node[field]) && node[field].some(isPlainObject))
          push({
            kind: isList ? 'list' : 'field',
            nodePath: path,
            field,
            crumbs,
            label: labelFor(shape, field),
            preview: previewOf(node[field]),
            targetPath: [...path, field],
          })
        }
        if (isPlainObject(node.hiddenItems)) {
          for (const field of Object.keys(node.hiddenItems)) {
            const list = Array.isArray(node[field]) ? node[field] : []
            for (const index of hiddenIndices(node, field)) {
              const v = list[index]
              push({
                kind: 'item',
                nodePath: path,
                field,
                index,
                crumbs,
                label: `${labelFor(shape, field)} #${index + 1}`,
                preview: typeof v === 'string' ? truncate(v) : '',
                targetPath: [...path, field, index],
              })
            }
          }
        }
        for (const key of Object.keys(node)) {
          if (META.has(key)) continue
          const value = node[key]
          if (Array.isArray(value)) {
            const listDef = shape.lists?.find((l) => l.key === key)
            value.forEach((item, i) => {
              if (!isPlainObject(item)) return
              const title = truncate((listDef?.titleOf(item) || '').trim(), 48) || `${listDef?.itemNoun ? humanizeKey(listDef.itemNoun) : humanizeKey(key)} ${i + 1}`
              const itemPath = [...path, key, i]
              if (item.isVisible === false) {
                push({
                  kind: 'entry',
                  nodePath: itemPath,
                  crumbs,
                  label: title,
                  preview: truncate((listDef?.subtitleOf?.(item) || '').trim()),
                  targetPath: itemPath,
                })
              }
              walk(item, itemPath, { fields: listDef?.fields, lists: listDef?.lists }, [...crumbs, title])
            })
          } else if (isPlainObject(value)) {
            walk(value, [...path, key], {}, [...crumbs, humanizeKey(key)])
          }
        }
      }
      walk(section, [sectionIdx], { fields: def?.fields, lists: def?.lists }, [sectionLabel])
    })
  }
  return rows
}
