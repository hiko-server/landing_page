import { parseOgParams, type OgParams } from '../security/ogParams'
import { isOgPresetId, presetCard } from './presets'
import { verifyOgSignature } from './sign'

/**
 * What /api/og renders for a query:
 *   - `card=<id>`: a fixed card from lib/og/presets.ts (no free text accepted);
 *   - free parameters with a valid `sig` (lib/og/sign.ts): exactly those;
 *   - anything else: the generic default card. `reason` says why, so the
 *     route can cache a refused URL briefly instead of for a year.
 */

export type CardSource = 'preset' | 'signed' | 'default' | 'refused'

export type ResolvedCard = { source: CardSource; params: OgParams }

const TEXT_PARAMS = ['title', 'subtitle', 'kind', 'date', 'mins', 'tags', 'cover', 'focus', 'v', 'sig']

/** The default card in the requested size (the only parameter honoured without a signature). */
export function defaultCardParams(search: URLSearchParams): OgParams {
  return parseOgParams(
    new URLSearchParams(search.get('size') === 'square' ? { size: 'square' } : {})
  )
}

export function resolveCard(search: URLSearchParams, key: Buffer | null): ResolvedCard {
  const card = search.get('card')
  if (card !== null) {
    if (!isOgPresetId(card)) return { source: 'refused', params: defaultCardParams(search) }
    const preset = presetCard(card, search.get('lang') === 'zh' ? 'zh' : 'en')
    const p = new URLSearchParams({ kind: preset.kind, title: preset.title })
    if ('subtitle' in preset && preset.subtitle) p.set('subtitle', preset.subtitle)
    if (preset.lang === 'zh') p.set('lang', 'zh')
    if (search.get('size') === 'square') p.set('size', 'square')
    return { source: 'preset', params: parseOgParams(p) }
  }
  if (search.has('sig')) {
    return verifyOgSignature(search, key)
      ? { source: 'signed', params: parseOgParams(search) }
      : { source: 'refused', params: defaultCardParams(search) }
  }
  // Unsigned free text is never rendered.
  const hasText = TEXT_PARAMS.some((k) => search.has(k))
  return { source: hasText ? 'refused' : 'default', params: defaultCardParams(search) }
}
