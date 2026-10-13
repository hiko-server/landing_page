import { readFile } from 'fs/promises'
import path from 'path'
import type { NextApiRequest, NextApiResponse } from 'next'
import { ImageResponse } from '@vercel/og'
import { withApi } from '../../lib/apiHandler'
import { rateLimit } from '../../lib/rateLimit'
import { defaultCardParams, resolveCard, type CardSource } from '../../lib/og/resolve'
import { ogSigningKey } from '../../lib/og/sign'
import type { OgParams } from '../../lib/security/ogParams'
import { SITE_URL } from '../../lib/schema'

// Open Graph card rendered to PNG via @vercel/og (Satori + Resvg).
//
//   /api/og?card=about                              fixed card (lib/og/presets)
//   /api/og?kind=blog&title=…&date=2026-05-30&mins=6&tags=Edge%20AI,YOLO
//          &cover=/uploads/x.jpg&lang=zh&size=square&v=1780000000000&sig=…
//                                                  content card, HMAC-signed
//   /api/og                                         generic default card
//
// Brand card: #050505 with an 8px dot grid and one indigo glow, a mono
// "[BLOG] Li Yanpei (Lucian)" row, the title in Geist SemiBold (sized by
// length), a mono meta row, and the cover on the right when there is one.
// `size=square` renders 1200×1200 (schema.org image variants); `lang=zh`
// switches the static strings. CJK glyphs fall back to @vercel/og's dynamic
// font loading.
//
// Runs on the Node.js runtime (the Edge runtime is deprecated in Next 16).
// Next resolves `@vercel/og` to its bundled copy and loads the Node build —
// the same Satori and resvg-wasm as the Edge build, so cards are the same
// bytes. The brand fonts are read from assets/og (traced into the standalone
// output through next.config.js outputFileTracingIncludes).
//
// Hardening: no free text is ever rendered without a valid signature
// (lib/og/resolve: fixed cards by id, signed content cards, else the default
// card), every param is validated (lib/security/ogParams — the cover is only
// ever a same-site /uploads file), renders are rate limited per client, and
// a card is a pure function of its URL, so it is cached hard — a day in
// browsers, a year (immutable) at Cloudflare. A refused URL gets the default
// card, cached for a day only; the default card itself is rendered once per
// size and kept in memory.

const RENDERS_PER_MINUTE = 60
const CACHE_CONTROL = 'public, max-age=86400, s-maxage=31536000, immutable'
const REFUSED_CACHE_CONTROL = 'public, max-age=3600, s-maxage=86400'

type FontSpec = { name: string; data: Buffer; weight: 400 | 600; style: 'normal' }

type OgGlobal = typeof globalThis & {
  __ogFonts?: Promise<FontSpec[]> | null
  __ogDefaultCards?: Map<string, Buffer>
}
const g = globalThis as OgGlobal

/** The brand fonts, read once per process. */
function loadFonts(): Promise<FontSpec[]> {
  if (!g.__ogFonts) {
    const dir = path.join(process.cwd(), 'assets', 'og')
    const file = (name: string) => readFile(path.join(dir, name))
    g.__ogFonts = Promise.all([file('Geist-Regular.ttf'), file('Geist-SemiBold.ttf'), file('GeistMono-Regular.ttf')]).then(([regular, semibold, mono]) => [
      { name: 'Geist', data: regular, weight: 400, style: 'normal' },
      { name: 'Geist', data: semibold, weight: 600, style: 'normal' },
      { name: 'Geist Mono', data: mono, weight: 400, style: 'normal' },
    ])
    g.__ogFonts.catch(() => {
      g.__ogFonts = null
    })
  }
  return g.__ogFonts
}

const LABELS = {
  en: { blog: 'BLOG', work: 'WORK', cv: 'CV', home: 'HOME', page: 'PAGE', min: 'min' },
  zh: { blog: '文章', work: '案例', cv: '简历', home: '主页', page: '页面', min: '分钟' },
} as const

function kindLabel(kind: string, lang: 'en' | 'zh'): string {
  const table = LABELS[lang] as Record<string, string>
  return table[kind] || kind.toUpperCase()
}

/** Title size steps by length (code points). */
function titleSize(title: string, square: boolean): number {
  const n = Array.from(title).length
  const base = n <= 40 ? 72 : n <= 70 ? 60 : 48
  return square ? Math.round(base * 1.15) : base
}

function metaLine(p: OgParams): string {
  const parts: string[] = []
  if (p.date) parts.push(p.date)
  if (p.mins) parts.push(`${p.mins} ${LABELS[p.lang].min}`)
  if (p.tags.length) parts.push(p.tags.join(' / '))
  return parts.join(' · ')
}

const MONO = '"Geist Mono", ui-monospace, monospace'
const SANS = 'Geist, system-ui, sans-serif'

/** Render one card to PNG bytes. */
async function renderCard(p: OgParams): Promise<Buffer> {
  const square = p.size === 'square'
  const height = square ? 1200 : 630
  const padding = square ? 88 : 72
  const meta = metaLine(p)
  // Same-site only (validated in parseOgParams): Satori fetches it from the canonical origin.
  const cover = p.cover ? `${SITE_URL}${p.cover}` : ''
  const fonts = await loadFonts()

  const textColumn = (
    <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', flex: 1, minWidth: 0, gap: 32 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 20, fontFamily: MONO, fontSize: 24, color: '#a1a1a1', letterSpacing: 1 }}>
        <div style={{ display: 'flex', color: '#a5b4fc' }}>[{kindLabel(p.kind, p.lang)}]</div>
        <div style={{ display: 'flex' }}>Li Yanpei (Lucian)</div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
        <div
          style={{
            display: 'flex',
            fontFamily: SANS,
            fontWeight: 600,
            fontSize: titleSize(p.title, square),
            lineHeight: 1.08,
            letterSpacing: -1.5,
            color: '#fafafa',
          }}
        >
          {p.title}
        </div>
        {p.subtitle ? (
          <div style={{ display: 'flex', fontFamily: SANS, fontWeight: 400, fontSize: 28, lineHeight: 1.4, color: '#a1a1a1' }}>{p.subtitle}</div>
        ) : null}
      </div>
      <div style={{ display: 'flex', fontFamily: MONO, fontSize: 22, color: '#8a8a8a', letterSpacing: 0.5, minHeight: 28 }}>{meta}</div>
    </div>
  )

  const image = new ImageResponse(
    (
      <div style={{ width: '100%', height: '100%', display: 'flex', position: 'relative', backgroundColor: '#050505' }}>
        {/* 8px dot grid */}
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: '100%',
            height: '100%',
            backgroundImage: 'radial-gradient(circle, rgba(255,255,255,0.08) 1px, transparent 1px)',
            backgroundSize: '8px 8px',
          }}
        />
        {/* one indigo glow */}
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: '100%',
            height: '100%',
            backgroundImage: 'radial-gradient(circle at 85% 10%, rgba(99,102,241,0.35) 0%, rgba(99,102,241,0) 50%)',
          }}
        />
        <div
          style={{
            position: 'relative',
            display: 'flex',
            flexDirection: square && cover ? 'column-reverse' : 'row',
            gap: 56,
            padding,
            width: '100%',
            height: '100%',
          }}
        >
          {textColumn}
          {cover ? (
            <div
              style={{
                display: 'flex',
                width: square ? '100%' : '40%',
                height: square ? '42%' : '100%',
                flexShrink: 0,
                borderRadius: 12,
                border: '1px solid rgba(255,255,255,0.14)',
                overflow: 'hidden',
              }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={cover} alt="" width={square ? 1024 : 420} height={square ? 460 : 486} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            </div>
          ) : null}
        </div>
      </div>
    ),
    { width: 1200, height, fonts },
  )
  return Buffer.from(await image.arrayBuffer())
}

/** The default card, rendered once per size per process. */
async function defaultCard(p: OgParams): Promise<Buffer> {
  if (!g.__ogDefaultCards) g.__ogDefaultCards = new Map()
  const hit = g.__ogDefaultCards.get(p.size)
  if (hit) return hit
  const png = await renderCard(p)
  g.__ogDefaultCards.set(p.size, png)
  return png
}

function send(res: NextApiResponse, png: Buffer, cacheControl: string, source: CardSource) {
  res.setHeader('Content-Type', 'image/png')
  res.setHeader('Content-Length', String(png.length))
  res.setHeader('Cache-Control', cacheControl)
  res.setHeader('X-Card', source)
  res.status(200).end(png)
}

export default withApi('og', async (req: NextApiRequest, res: NextApiResponse, ctx) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.setHeader('Allow', 'GET, HEAD')
    return res.status(405).end()
  }
  const search = new URLSearchParams((req.url || '').split('?')[1] || '')
  const card = resolveCard(search, ogSigningKey())
  const isDefault = card.source === 'default' || card.source === 'refused'
  const cacheControl = card.source === 'refused' ? REFUSED_CACHE_CONTROL : CACHE_CONTROL

  if (isDefault && g.__ogDefaultCards?.has(card.params.size)) {
    return send(res, g.__ogDefaultCards.get(card.params.size) as Buffer, cacheControl, card.source)
  }

  const hit = rateLimit(req, RENDERS_PER_MINUTE, 60_000, 'og')
  if (!hit.allowed) {
    res.setHeader('Cache-Control', 'no-store')
    res.setHeader('Retry-After', String(Math.max(1, Math.ceil((hit.resetAt - Date.now()) / 1000))))
    res.setHeader('Content-Type', 'text/plain; charset=utf-8')
    return res.status(429).end('Too many requests')
  }

  try {
    const png = isDefault ? await defaultCard(card.params) : await renderCard(card.params)
    return send(res, png, cacheControl, card.source)
  } catch (err) {
    // A card that cannot render (an unreachable cover, a font fetch that
    // failed) degrades to the default card, cached briefly.
    ctx.log.error('social card render failed; serving the default card', { err, source: card.source })
    const png = await defaultCard(defaultCardParams(search))
    return send(res, png, REFUSED_CACHE_CONTROL, 'refused')
  }
})
