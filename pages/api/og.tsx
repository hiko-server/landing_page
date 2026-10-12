import { ImageResponse } from '@vercel/og'
import type { NextRequest } from 'next/server'
import { getClientIpHeaderName } from '../../lib/env'
import { ipBucket, pickClientIp } from '../../lib/security/ip'
import { parseOgParams } from '../../lib/security/ogParams'
import { sharedLimiter } from '../../lib/security/rateLimitCore'

// Dynamic Open Graph card rendered to PNG via @vercel/og (Satori + Resvg).
//
// Usage:
//   /api/og?title=Now&kind=page&subtitle=What%20I%27m%20focused%20on
//
// Runs on the Edge runtime — required by @vercel/og for streaming PNG output
// with WASM-backed image rendering.
//
// Hardening: texts are clamped (lib/security/ogParams), renders are rate
// limited per client, and a card is a pure function of its URL, so it is
// cached hard — a day in browsers, a year (immutable) at Cloudflare — and
// repeated crawls never reach the renderer.

export const config = {
  runtime: 'edge',
}

const RENDERS_PER_MINUTE = 60
const CACHE_CONTROL = 'public, max-age=86400, s-maxage=31536000, immutable'

export default function handler(req: NextRequest) {
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

  const { title, kind, subtitle } = parseOgParams(new URL(req.url).searchParams)

  const titleFontSize = title.length > 60 ? 64 : title.length > 30 ? 76 : 88

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          padding: '90px 100px',
          background:
            'radial-gradient(ellipse at 85% 15%, rgba(139,92,246,0.22) 0%, rgba(139,92,246,0) 55%), linear-gradient(135deg, #0a0a0a 0%, #141414 55%, #1a1a2e 100%)',
          fontFamily:
            '-apple-system, system-ui, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
        }}
      >
        <div
          style={{
            display: 'flex',
            color: '#a3a3a3',
            fontFamily: 'ui-monospace, "SF Mono", Menlo, monospace',
            fontSize: 22,
            letterSpacing: 4,
            textTransform: 'uppercase',
          }}
        >
          [{kind}] · LUCIAN-DEV.COM
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>
          <div
            style={{
              display: 'flex',
              color: '#f5f5f5',
              fontSize: titleFontSize,
              fontWeight: 600,
              lineHeight: 1.1,
              letterSpacing: -1,
            }}
          >
            {title}
          </div>
          {subtitle ? (
            <div
              style={{
                display: 'flex',
                color: '#a3a3a3',
                fontSize: 28,
                lineHeight: 1.4,
                fontWeight: 400,
              }}
            >
              {subtitle}
            </div>
          ) : null}
        </div>

        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            color: '#737373',
            fontSize: 22,
          }}
        >
          <div style={{ display: 'flex' }}>Li Yanpei · Software Engineer</div>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '12px 28px',
              border: '1px solid #404040',
              borderRadius: 999,
              color: '#a3a3a3',
              fontFamily: 'ui-monospace, "SF Mono", Menlo, monospace',
              fontSize: 18,
              letterSpacing: 2,
            }}
          >
            LUCIAN-DEV.COM
          </div>
        </div>
      </div>
    ),
    {
      width: 1200,
      height: 630,
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
