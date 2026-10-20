/**
 * Tracking parameters in links (pure, unit-tested).
 *
 * A parameter is removed only when it is on the lists below: names whose
 * single purpose is attributing a click (campaign tags, ad and e-mail click
 * ids, share tokens that identify the person who shared). Anything that can
 * change what the page shows stays — e.g. GitHub's `ref` (a branch), Medium's
 * `sk` (a friend link), a YouTube `t` (a start time), Amazon's `tag`.
 *
 * Stripping works on the raw text of the link, so everything else keeps its
 * exact spelling: the other parameters in their order and encoding, the
 * fragment, a scheme-less GFM autolink (`www.example.com/?fbclid=…`).
 */

/** utm_source, utm_medium, utm_campaign, utm_term, utm_content, utm_id, … */
const PREFIXES = ['utm_']

/** Click and campaign ids that carry no page state anywhere. */
const EVERYWHERE = new Set([
  'fbclid', // Facebook
  'gclid', // Google Ads
  'gclsrc',
  'dclid', // Google Display
  'gbraid', // Google Ads (iOS)
  'wbraid',
  'msclkid', // Microsoft Ads
  'yclid', // Yandex
  'twclid', // X / Twitter Ads
  'ttclid', // TikTok Ads
  'li_fat_id', // LinkedIn Ads
  'rdt_cid', // Reddit Ads
  'epik', // Pinterest
  'srsltid', // Google Search / Merchant Center result id
  'mc_cid', // Mailchimp
  'mc_eid',
  'igshid', // Instagram share id
  'igsh',
  '_hsenc', // HubSpot
  '_hsmi',
  '__hstc',
  '__hssc',
  '__hsfp',
  'hsctatracking',
  'mkt_tok', // Marketo
  '_ga', // Google Analytics cross-domain linker
  '_gl',
  'ref_src', // X / Twitter embeds
  'ref_url',
  'oly_anon_id', // Omeda
  'oly_enc_id',
  'vero_id', // Vero
  'vero_conv',
  'wickedid',
  'rb_clickid',
])

/** Share tokens that are tracking only on the sites that issue them. */
const BY_HOST: ReadonlyArray<{ hosts: readonly string[]; names: ReadonlySet<string> }> = [
  // ?si= on share links; feature=share / feature=youtu.be (never the video, never `t`).
  { hosts: ['youtube.com', 'youtu.be', 'youtube-nocookie.com'], names: new Set(['si', 'feature']) },
  { hosts: ['spotify.com', 'spotify.link'], names: new Set(['si']) },
  // rcm / lipi / midToken name the member who shared or was mailed the link.
  {
    hosts: ['linkedin.com'],
    names: new Set(['rcm', 'trk', 'trkinfo', 'lipi', 'midtoken', 'midsig', 'trackingid']),
  },
  { hosts: ['twitter.com', 'x.com'], names: new Set(['s', 't']) },
  { hosts: ['facebook.com', 'fb.com', 'fb.me'], names: new Set(['mibextid']) },
  { hosts: ['tiktok.com'], names: new Set(['is_from_webapp', 'sender_device', 'sender_web_id']) },
  { hosts: ['reddit.com'], names: new Set(['share_id']) },
]

function hostOfRaw(raw: string): string | null {
  const withScheme = raw.startsWith('//')
    ? `https:${raw}`
    : /^[a-z][a-z0-9+.-]*:/i.test(raw)
      ? raw
      : `http://${raw}`
  try {
    const u = new URL(withScheme)
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null
    return u.hostname.toLowerCase()
  } catch {
    return null
  }
}

function hostMatches(host: string, suffix: string): boolean {
  return host === suffix || host.endsWith(`.${suffix}`)
}

function paramName(segment: string): string {
  const name = segment.split('=')[0]
  try {
    return decodeURIComponent(name.replace(/\+/g, ' ')).toLowerCase()
  } catch {
    return name.toLowerCase()
  }
}

/** Is `name` (any case) a tracking parameter for a link to `host`? */
export function isTrackingParam(name: string, host: string | null): boolean {
  const n = name.toLowerCase()
  if (!n) return false
  if (PREFIXES.some((p) => n.startsWith(p)) || EVERYWHERE.has(n)) return true
  if (!host) return false
  return BY_HOST.some((rule) => rule.names.has(n) && rule.hosts.some((h) => hostMatches(host, h)))
}

type Split = { base: string; query: string | null; hash: string }

function split(raw: string): Split {
  const h = raw.indexOf('#')
  const beforeHash = h === -1 ? raw : raw.slice(0, h)
  const hash = h === -1 ? '' : raw.slice(h)
  const q = beforeHash.indexOf('?')
  if (q === -1) return { base: beforeHash, query: null, hash }
  return { base: beforeHash.slice(0, q), query: beforeHash.slice(q + 1), hash }
}

/** Names of the tracking parameters in an http(s) link (as written, lower-cased, in order, unique). */
export function trackingParamsIn(raw: string): string[] {
  const host = hostOfRaw(raw)
  if (!host) return []
  const { query } = split(raw)
  if (!query) return []
  const out: string[] = []
  for (const seg of query.split('&')) {
    const name = paramName(seg)
    if (isTrackingParam(name, host) && !out.includes(name)) out.push(name)
  }
  return out
}

/** The link without its tracking parameters; unchanged when it has none. */
export function stripTrackingParams(raw: string): string {
  const host = hostOfRaw(raw)
  if (!host) return raw
  const { base, query, hash } = split(raw)
  if (!query) return raw
  const segments = query.split('&')
  const kept = segments.filter((seg) => !isTrackingParam(paramName(seg), host))
  if (kept.length === segments.length) return raw
  const rest = kept.filter((seg) => seg !== '')
  return `${base}${rest.length ? `?${rest.join('&')}` : ''}${hash}`
}
