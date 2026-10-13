import { absUrl, type OgImageOptions } from '../schema'

/**
 * Fixed social cards for the site's fixed pages, addressed by id:
 * /api/og?card=<id>[&lang=zh][&size=square]. The endpoint renders the text
 * from this table, so these URLs need no signature and carry no free text —
 * nobody can make a lucian-dev.com card say something else
 * (CRIT-og-signing). Cards built from content (a post, a case study) are
 * HMAC-signed instead (lib/og/sign.ts). Shared by the pages (client and
 * server) and the endpoint.
 */

type Card = Pick<OgImageOptions, 'kind' | 'title' | 'subtitle'>

export const OG_PRESETS = {
  home: {
    en: {
      kind: 'home',
      title: 'Li Yanpei (Lucian)',
      subtitle: 'Software engineer: full-stack, ML / computer vision, embedded',
    },
  },
  about: { en: { kind: 'page', title: 'About', subtitle: 'Background, skills & projects' } },
  colophon: { en: { kind: 'page', title: 'Colophon', subtitle: 'How this site is made' } },
  now: { en: { kind: 'page', title: 'Now', subtitle: 'What I’m focused on' } },
  contact: { en: { kind: 'page', title: 'Get in touch', subtitle: 'Contact Li Yanpei (Lucian)' } },
  writing: { en: { kind: 'blog', title: 'Writing', subtitle: 'Essays, notes, and write-ups' } },
  work: { en: { kind: 'work', title: 'Selected Work', subtitle: 'Project case studies' } },
  uses: { en: { kind: 'page', title: 'Uses', subtitle: 'Tools & setup' } },
  'uses-built': {
    en: {
      kind: 'page',
      title: 'How this site is built',
      subtitle: 'The stack, hosting and tooling behind lucian-dev.com.',
    },
  },
  cv: { en: { kind: 'cv', title: 'CV / Résumé' }, zh: { kind: 'cv', title: '简历' } },
  publications: { en: { kind: 'page', title: 'Publications', subtitle: 'Papers, preprints and theses' } },
} as const satisfies Record<string, { en: Card; zh?: Card }>

export type OgPresetId = keyof typeof OG_PRESETS

export function isOgPresetId(v: unknown): v is OgPresetId {
  return typeof v === 'string' && Object.prototype.hasOwnProperty.call(OG_PRESETS, v)
}

/** The card a preset renders in `lang` (falls back to English when the preset has no Chinese text). */
export function presetCard(id: OgPresetId, lang: 'en' | 'zh' = 'en'): Card & { lang: 'en' | 'zh' } {
  const entry = OG_PRESETS[id] as { en: Card; zh?: Card }
  const card = lang === 'zh' && entry.zh ? entry.zh : entry.en
  return { ...card, lang: lang === 'zh' && entry.zh ? 'zh' : 'en' }
}

/** Absolute URL of a fixed card. */
export function ogPresetUrl(
  id: OgPresetId,
  opts: { lang?: 'en' | 'zh'; size?: 'square' } = {}
): string {
  const params = new URLSearchParams({ card: id })
  if (opts.lang === 'zh' && (OG_PRESETS[id] as { zh?: Card }).zh) params.set('lang', 'zh')
  if (opts.size === 'square') params.set('size', 'square')
  return absUrl(`/api/og?${params.toString()}`)
}

/** The generic card (any page without its own; also what an invalid signature gets). */
export function defaultOgImageUrl(): string {
  return absUrl('/api/og')
}
