import Head from 'next/head'
import Link from 'next/link'

// Kept deliberately dependency-light so it renders even when something upstream
// is failing. noindex so a transient 500 never enters the search index.
// Colours come from the theme's CSS variables (with light fallbacks), so the
// page stays readable in both colour modes.
export default function Custom500() {
  return (
    <>
      <Head>
        <title>500 — Server Error | lucian-dev.com</title>
        <meta name="robots" content="noindex, nofollow" />
      </Head>
      <main id="main" style={{ maxWidth: 720, margin: '0 auto', padding: '96px 20px', textAlign: 'center' }}>
        <p
          style={{
            fontFamily: 'var(--font-geist-mono), ui-monospace, monospace',
            fontSize: 12,
            letterSpacing: '0.16em',
            color: 'var(--accent, #6366f1)',
            marginBottom: 12,
          }}
        >
          ERROR 500
        </p>
        <h1 style={{ fontSize: 32, fontWeight: 500, marginBottom: 12, color: 'var(--chakra-colors-page-fg, #0a0a0a)' }}>
          Something went wrong
        </h1>
        <p style={{ color: 'var(--chakra-colors-page-fg-secondary, #525252)' }}>
          An unexpected error occurred. Please try again, or{' '}
          <Link href="/" style={{ color: 'var(--accent, #4f46e5)', textDecoration: 'underline' }}>
            go back home
          </Link>
          .
        </p>
      </main>
    </>
  )
}
