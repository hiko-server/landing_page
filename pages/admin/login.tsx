import { useCallback, useEffect, useRef, useState } from 'react'
import { Box, Button, Flex, Link, Text, VStack } from '@chakra-ui/react'
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
import { MONO, outlineButtonProps } from '../../components/Admin/shell/ui'
import { readJsonObject } from '../../components/Admin/shell/http'
import { NETWORK_ERROR, loginErrorMessage } from '../../components/Admin/shell/authMessages'
import { KeyIcon } from '../../components/Admin/security/icons'
import {
  autofillAvailable,
  cancelCeremony,
  describeWebAuthnError,
  forgetUnknownPasskey,
  getAssertion,
  isCeremonyCancelled,
  webAuthnAvailable,
} from '../../components/Admin/security/webauthnClient'

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

type PasskeyOptions = { rpId?: string } & Record<string, unknown>

/**
 * Admin sign-in: e-mail + password, or a passkey (WebAuthn) — through the
 * button, or straight from the e-mail field's autofill where the browser
 * supports conditional mediation. With "Require a passkey" on, the password
 * form asks for a recovery code as well. Server: /api/auth/email-login and
 * /api/auth/passkey/{options,verify}.
 */
export default function AdminLogin() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [recoveryCode, setRecoveryCode] = useState('')
  const [needsRecovery, setNeedsRecovery] = useState(false)
  const [error, setError] = useState('')
  const [fieldErrors, setFieldErrors] = useState<{ email?: string; password?: string; recoveryCode?: string }>({})
  const [submitting, setSubmitting] = useState(false)
  const [passkeyBusy, setPasskeyBusy] = useState(false)
  // Rendered from the first paint (every current browser has WebAuthn), hidden
  // after mount only where it is missing — so the card never grows late.
  const [passkeys, setPasskeys] = useState(true)
  const emailRef = useRef<HTMLInputElement>(null)
  const passwordRef = useRef<HTMLInputElement>(null)
  const recoveryRef = useRef<HTMLInputElement>(null)
  const nextRef = useRef('/admin')

  useEffect(() => {
    nextRef.current = safeNextPath(router.query.next)
  }, [router.query.next])

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

  /** Fetch a sign-in challenge; null (with the error shown) when unavailable. */
  const passkeyOptions = useCallback(async (): Promise<PasskeyOptions | null> => {
    const res = await fetch('/api/auth/passkey/options', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })
    const json = await readJsonObject(res)
    if (res.ok && json.options) return json.options as PasskeyOptions
    if (res.status !== 400) setError(typeof json.error === 'string' ? json.error : loginErrorMessage(res.status))
    return null
  }, [])

  /** Send an assertion to the server; true when signed in. */
  const finishPasskey = useCallback(async (response: unknown, rpId: string | undefined): Promise<boolean> => {
    const res = await fetch('/api/auth/passkey/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ response }),
    })
    if (res.ok) {
      window.location.href = nextRef.current
      return true
    }
    const json = await readJsonObject(res)
    if (json.code === 'UNKNOWN_CREDENTIAL') {
      if (rpId && typeof json.credentialId === 'string') void forgetUnknownPasskey(rpId, json.credentialId)
      setError('That passkey is no longer registered here. Use another passkey or your password.')
    } else {
      setError(typeof json.error === 'string' ? json.error : loginErrorMessage(res.status))
    }
    return false
  }, [])

  // Passkeys offered in the e-mail field's autofill (conditional mediation).
  useEffect(() => {
    if (!webAuthnAvailable()) {
      setPasskeys(false)
      return
    }
    let alive = true
    void (async () => {
      if (!(await autofillAvailable()) || !alive) return
      let options: PasskeyOptions | null = null
      try {
        options = await passkeyOptions()
      } catch {
        return
      }
      if (!options || !alive) return
      try {
        const response = await getAssertion(options as never, { autofill: true })
        if (!alive) return
        setPasskeyBusy(true)
        if (!(await finishPasskey(response, options.rpId))) setPasskeyBusy(false)
      } catch {
        // Cancelled by the button flow, a page change, or the user: nothing to report.
      }
    })()
    return () => {
      alive = false
      void cancelCeremony()
    }
  }, [passkeyOptions, finishPasskey])

  const signInWithPasskey = async () => {
    if (passkeyBusy || submitting) return
    setError('')
    setPasskeyBusy(true)
    try {
      await cancelCeremony()
      const options = await passkeyOptions()
      if (!options) return
      let response: unknown
      try {
        response = await getAssertion(options as never)
      } catch (err) {
        if (!isCeremonyCancelled(err)) setError(describeWebAuthnError(err))
        return
      }
      if (await finishPasskey(response, options.rpId)) return
    } catch {
      setError(NETWORK_ERROR)
    } finally {
      setPasskeyBusy(false)
    }
  }

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (submitting) return
    const errs: { email?: string; password?: string; recoveryCode?: string } = {}
    if (!email.trim()) errs.email = 'Enter your email address.'
    else if (!EMAIL_RE.test(email.trim())) errs.email = 'Enter a valid email address.'
    if (!password) errs.password = 'Enter your password.'
    if (needsRecovery && !recoveryCode.trim()) errs.recoveryCode = 'Enter one of your recovery codes.'
    setFieldErrors(errs)
    setError('')
    if (errs.email) return emailRef.current?.focus()
    if (errs.password) return passwordRef.current?.focus()
    if (errs.recoveryCode) return recoveryRef.current?.focus()

    setSubmitting(true)
    try {
      const res = await fetch('/api/auth/email-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), password, ...(needsRecovery ? { recoveryCode } : {}) }),
      })
      if (res.ok) {
        window.location.href = nextRef.current
        return
      }
      const json = await readJsonObject(res)
      setSubmitting(false)
      if (json.code === 'PASSKEY_REQUIRED') {
        setNeedsRecovery(true)
        setError(typeof json.error === 'string' ? json.error : 'This account signs in with a passkey.')
        requestAnimationFrame(() => recoveryRef.current?.focus())
        return
      }
      if (json.code === 'PASSWORD_OR_RECOVERY_INVALID') {
        setError(String(json.error))
        requestAnimationFrame(() => recoveryRef.current?.select())
        return
      }
      setError(loginErrorMessage(res.status))
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

  const busy = submitting || passkeyBusy

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
                // "webauthn" lets the browser offer this site's passkeys right in the field.
                autoComplete="username webauthn"
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
                isDisabled={busy}
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
                isDisabled={busy}
                isRequired
              />
              {needsRecovery ? (
                <AuthField
                  label="Recovery code"
                  name="recovery-code"
                  autoComplete="one-time-code"
                  autoCapitalize="characters"
                  autoCorrect="off"
                  spellCheck={false}
                  fontFamily={MONO}
                  placeholder="XXXX-XXXX-XXXX-XXXX"
                  inputRef={recoveryRef}
                  value={recoveryCode}
                  onChange={(e) => {
                    setRecoveryCode(e.target.value)
                    if (fieldErrors.recoveryCode) setFieldErrors((f) => ({ ...f, recoveryCode: undefined }))
                  }}
                  error={fieldErrors.recoveryCode}
                  helper="One of the codes you saved when you added your first passkey. Each code works once."
                  isDisabled={busy}
                  isRequired
                />
              ) : null}
              <AuthSubmit isLoading={submitting} loadingText="Signing in…" isDisabled={passkeyBusy}>
                Sign in
              </AuthSubmit>
            </VStack>
          </form>
          {passkeys ? (
            <Box mt={5}>
              <Flex align="center" gap={3} mb={4} aria-hidden>
                <Box flex={1} h="1px" bg="page.border" />
                <Text fontFamily={MONO} fontSize="10px" letterSpacing="0.12em" textTransform="uppercase" color="page.fg-secondary">
                  or
                </Text>
                <Box flex={1} h="1px" bg="page.border" />
              </Flex>
              <Button
                w="full"
                leftIcon={<KeyIcon />}
                onClick={() => void signInWithPasskey()}
                isLoading={passkeyBusy}
                loadingText="Waiting for your passkey…"
                isDisabled={submitting}
                {...outlineButtonProps}
              >
                Sign in with a passkey
              </Button>
            </Box>
          ) : null}
        </AuthCard>
      </HeaderFooter>
    </>
  )
}
