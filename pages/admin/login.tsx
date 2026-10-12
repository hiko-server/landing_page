import { useEffect, useRef, useState } from 'react'
import { Flex, Link, VStack } from '@chakra-ui/react'
import NextLink from 'next/link'
import { useRouter } from 'next/router'
import HeaderFooter from '../../layout/HeaderFooter'
import CustomHead from '../../components/General-UI/CustomHead'
import {
  AuthCard,
  AuthError,
  AuthField,
  AuthSubmit,
  PasswordField,
} from '../../components/Admin/AuthCard'
import { NETWORK_ERROR, loginErrorMessage } from '../../components/Admin/shell/authMessages'

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
  if (raw.startsWith('//') || raw.startsWith('/\\')) return '/admin' // protocol-relative URL
  if (raw.startsWith('/admin/login')) return '/admin'
  if (raw.startsWith('/admin/forgot')) return '/admin'
  if (raw.startsWith('/admin/reset')) return '/admin'
  if (raw === '/admin' || raw.startsWith('/admin/') || raw.startsWith('/admin?')) return raw
  return '/admin'
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export default function AdminLogin() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [fieldErrors, setFieldErrors] = useState<{ email?: string; password?: string }>({})
  const [submitting, setSubmitting] = useState(false)
  const emailRef = useRef<HTMLInputElement>(null)
  const passwordRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    // Wait for the query (?next=…) before deciding where to bounce to.
    if (!router.isReady) return
    let alive = true
    fetch('/api/admin/session', { cache: 'no-store' })
      .then((res) => (res.ok ? res.json() : { authenticated: false }))
      .then((d) => {
        if (alive && d?.authenticated) window.location.replace(safeNextPath(router.query.next))
      })
      .catch(() => {
        // Stay on the form; signing in still works.
      })
    return () => {
      alive = false
    }
  }, [router.isReady, router.query.next])

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (submitting) return
    const errs: { email?: string; password?: string } = {}
    if (!email.trim()) errs.email = 'Enter your email address.'
    else if (!EMAIL_RE.test(email.trim())) errs.email = 'Enter a valid email address.'
    if (!password) errs.password = 'Enter your password.'
    setFieldErrors(errs)
    setError('')
    if (errs.email) return emailRef.current?.focus()
    if (errs.password) return passwordRef.current?.focus()

    setSubmitting(true)
    try {
      const res = await fetch('/api/auth/email-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), password }),
      })
      if (res.ok) {
        window.location.href = safeNextPath(router.query.next)
        return
      }
      setError(loginErrorMessage(res.status))
      setSubmitting(false)
      if (res.status === 401) {
        // The inputs re-enable on the next render; focus after it.
        requestAnimationFrame(() => {
          passwordRef.current?.focus()
          passwordRef.current?.select()
        })
      }
    } catch {
      setError(NETWORK_ERROR)
      setSubmitting(false)
    }
  }

  return (
    <>
      <CustomHead title="Admin sign-in" description="Sign in to manage the site" noindex />
      <HeaderFooter>
        <AuthCard
          title="Sign in"
          subtitle="Manage the CV, home page, writing and storage."
          footer={
            <Flex justify="flex-end">
              <Link as={NextLink} href="/admin/forgot" color="accent.500">
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
                name="email"
                autoComplete="username"
                inputMode="email"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                inputRef={emailRef}
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value)
                  if (fieldErrors.email) setFieldErrors((f) => ({ ...f, email: undefined }))
                }}
                error={fieldErrors.email}
                isDisabled={submitting}
                isRequired
                autoFocus
              />
              <PasswordField
                label="Password"
                name="password"
                autoComplete="current-password"
                inputRef={passwordRef}
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value)
                  if (fieldErrors.password) setFieldErrors((f) => ({ ...f, password: undefined }))
                }}
                error={fieldErrors.password}
                isDisabled={submitting}
                isRequired
              />
              <AuthSubmit isLoading={submitting} loadingText="Signing in…">
                Sign in
              </AuthSubmit>
            </VStack>
          </form>
        </AuthCard>
      </HeaderFooter>
    </>
  )
}
