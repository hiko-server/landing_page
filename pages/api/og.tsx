import { ImageResponse } from '@vercel/og'
import type { NextRequest } from 'next/server'
import { getClientIpHeaderName } from '../../lib/env'
import { ipBucket, pickClientIp } from '../../lib/security/ip'
import { parseOgParams, type OgParams } from '../../lib/security/ogParams'
import { sharedLimiter } from '../../lib/security/rateLimitCore'
import { SITE_URL } from '../../lib/schema'

// Dynamic Open Graph card rendered to PNG via @vercel/og (Satori + Resvg).
//
//   /api/og?kind=blog&title=…&date=2026-05-30&mins=6&tags=Edge%20AI,YOLO
//          &cover=/uploads/x.webp&lang=zh&size=square&v=1780000000000
//
// Brand card: #050505 with an 8px dot grid and one indigo glow, a mono
// "[BLOG] Li Yanpei (Lucian)" row, the title in Geist SemiBold (sized by
// length), a mono meta row, and the cover on the right when there is one.
// `size=square` renders 1200×1200 (schema.org image variants); `lang=zh`
// switches the static strings. CJK glyphs fall back to @vercel/og's dynamic
// font loading.
//
// Runs on the Edge runtime — required by @vercel/og for streaming PNG output
// with WASM-backed image rendering.
//
// Hardening: every param is validated (lib/security/ogParams — the cover is
// only ever a same-site /uploads file, never an arbitrary URL), renders are
// rate limited per client, and a card is a pure function of its URL, so it
// is cached hard — a day in browsers, a year (immutable) at Cloudflare.

export const config = {
  runtime: 'edge',
}

const RENDERS_PER_MINUTE = 60
const CACHE_CONTROL = 'public, max-age=86400, s-maxage=31536000, immutable'

type FontSpec = { name: string; data: ArrayBuffer; weight: 400 | 600; style: 'normal' }

let fontsPromise: Promise<FontSpec[]> | null = null

/** The brand fonts, loaded once per isolate (static TTFs bundled with the route). */
function loadFonts(): Promise<FontSpec[]> {
  if (!fontsPromise) {
    const file = (url: URL) => fetch(url).then((r) => r.arrayBuffer())
    fontsPromise = Promise.all([
      file(new URL('../../assets/og/Geist-Regular.ttf', import.meta.url)),
      file(new URL('../../assets/og/Geist-SemiBold.ttf', import.meta.url)),
      file(new URL('../../assets/og/GeistMono-Regular.ttf', import.meta.url)),
    ]).then(([regular, semibold, mono]) => [
      { name: 'Geist', data: regular, weight: 400, style: 'normal' },
      { name: 'Geist', data: semibold, weight: 600, style: 'normal' },
      { name: 'Geist Mono', data: mono, weight: 400, style: 'normal' },
    ])
    fontsPromise.catch(() => {
      fontsPromise = null
    })
  }
  return fontsPromise
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

export default async function handler(req: NextRequest) {
  // The edge runtime exposes no socket peer; the trusted client-IP header
  // (cf-connecting-ip behind Cloudflare) is the only signal.
  const headerName = getClientIpHeaderName()
  const ip = pickClientIp({
    peer: '',
    headerName,
    headerValue: headerName ? req.headers.get(headerName) : null,
    trusted: [],
  })
  const hit = sharedLimiter('og', 5_000).hit(`og|${ipBucket(ip)}`, RENDERS_PER_MINUTE, 60_000)
  if (!hit.allowed) {
    return new Response('Too many requests', {
      status: 429,
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Cache-Control': 'no-store',
        'Retry-After': String(Math.max(1, Math.ceil((hit.resetAt - Date.now()) / 1000))),
      },
    })
  }

  const p = parseOgParams(new URL(req.url).searchParams)
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

  return new ImageResponse(
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
    {
      width: 1200,
      height,
      fonts,
      // Lower-case key on purpose: ImageResponse builds its headers as
      // { 'cache-control': <1-year immutable default>, ...headers }, so only
      // the identical key REPLACES the default. 'Cache-Control' would be a
      // second key and both values would be sent joined in one header.
      headers: {
        'cache-control': CACHE_CONTROL,
      },
    },
  )
}
