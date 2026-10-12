import Head from 'next/head'
import Link from 'next/link'

// Kept deliberately dependency-light so it renders even when something upstream
// is failing. noindex so a transient 500 never enters the search index.
export default function Custom500() {
  return (
    <>
      <Head>
        <title>500 — Server Error | lucian-dev.com</title>
        <meta name="robots" content="noindex, nofollow" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </Head>
      <main style={{ maxWidth: 720, margin: '0 auto', padding: '96px 20px', textAlign: 'center' }}>
        <h1 style={{ fontSize: 32, fontWeight: 500, marginBottom: 12 }}>500 — Something went wrong</h1>
        <p style={{ color: '#5c5c5c' }}>
          An unexpected error occurred. Please try again, or{' '}
          <Link href="/" style={{ color: '#4f46e5', textDecoration: 'underline' }}>go back home</Link>.
        </p>
      </main>
    </>
  )
}
