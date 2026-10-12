import { useEffect, useState } from 'react'
import { Flex, Link, VStack } from '@chakra-ui/react'
import NextLink from 'next/link'
import { useRouter } from 'next/router'
import HeaderFooter from '../../layout/HeaderFooter'
import CustomHead from '../../components/General-UI/CustomHead'
import { AuthCard, AuthError, AuthField, AuthSubmit, PasswordField } from '../../components/Admin/AuthCard'

/**
 * Only safe redirect targets are pages under /admin (and not the auth
 * stepping-stone pages themselves). Anything else falls back to /admin.
 *
 * Without this check a hostile referrer could spin
 *   /admin/login?next=https://evil.example/phish
 * and we'd cheerfully redirect a freshly-authenticated admin off-site.
 */
function safeNextPath(raw: string | string[] | undefined): string {
  if (typeof raw !== 'string') return '/admin'
  if (!raw.startsWith('/')) return '/admin'
  if (raw.startsWith('//')) return '/admin' // protocol-relative URL
  if (raw.startsWith('/admin/login')) return '/admin'
  if (raw.startsWith('/admin/forgot')) return '/admin'
  if (raw.startsWith('/admin/reset')) return '/admin'
  if (raw === '/admin' || raw.startsWith('/admin/')) return raw
  return '/admin'
}

export default function AdminLogin() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    // Wait for the query (?next=…) before deciding where to bounce to.
    if (!router.isReady) return
    let alive = true
    fetch('/api/admin/session')
      .then((res) => (res.ok ? res.json() : { authenticated: false }))
      .then((d) => {
        if (alive && d?.authenticated) window.location.replace(safeNextPath(router.query.next))
      })
      .catch(() => {})
    return () => {
      alive = false
    }
  }, [router.isReady, router.query.next])

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setSubmitting(true)
    try {
      const res = await fetch('/api/auth/email-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      })
      if (res.ok) {
        window.location.href = safeNextPath(router.query.next)
        return
      }
      const data = await res.json().catch(() => ({}))
      setError(data?.error || 'Sign-in failed')
    } catch (err: any) {
      setError(err?.message || 'Network error')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <>
      <CustomHead title="Admin Login" description="Sign in to manage the site" noindex />
      <HeaderFooter>
        <AuthCard
          title="Sign in"
          subtitle="Manage the CV, home page, writing and storage."
          footer={
            <Flex justify="flex-end">
              <Link as={NextLink} href="/admin/forgot" color="var(--accent)">
                Forgot password?
              </Link>
            </Flex>
          }
        >
          <AuthError>{error}</AuthError>
          <form onSubmit={onSubmit} noValidate>
            <VStack align="stretch" spacing={4}>
              <AuthField
                label="Email"
                type="email"
                autoComplete="username"
                inputMode="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                isDisabled={submitting}
                isRequired
                autoFocus
              />
              <PasswordField
                label="Password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                isDisabled={submitting}
                isRequired
              />
              <AuthSubmit isLoading={submitting} loadingText="Signing in…" isDisabled={!email || !password}>
                Sign in
              </AuthSubmit>
            </VStack>
          </form>
        </AuthCard>
      </HeaderFooter>
    </>
  )
}
