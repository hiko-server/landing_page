import { ImageResponse } from '@vercel/og'
import type { NextRequest } from 'next/server'

// Dynamic Open Graph card rendered to PNG via @vercel/og (Satori + Resvg).
//
// Usage:
//   /api/og?title=Now&kind=page&subtitle=What%20I%27m%20focused%20on
//
// Runs on the Edge runtime — required by @vercel/og for streaming PNG output
// with WASM-backed image rendering.

export const config = {
  runtime: 'edge',
}

export default function handler(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const title = (searchParams.get('title') || 'LUCIAN-DEV.COM').slice(0, 120)
  const kind = (searchParams.get('kind') || 'page').slice(0, 24)
  const subtitle = (searchParams.get('subtitle') || '').slice(0, 200)

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
      headers: {
        'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400',
      },
    },
  )
}
