import { useRouter } from 'next/router'
import { useEffect, useRef, useState } from 'react'
import { Alert, AlertDescription, AlertIcon, Button, Link, VStack } from '@chakra-ui/react'
import NextLink from 'next/link'
import HeaderFooter from '../../layout/HeaderFooter'
import CustomHead from '../../components/General-UI/CustomHead'
import { AuthCard, AuthError, AuthSubmit, PasswordField } from '../../components/Admin/AuthCard'
import { NETWORK_ERROR, resetPasswordErrorMessage } from '../../components/Admin/shell/authMessages'
import { primaryButtonProps } from '../../components/Admin/shell/ui'

const MIN_LENGTH = 12
const MAX_LENGTH = 1024

export default function ResetPassword() {
  const router = useRouter()
  const [token, setToken] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [touched, setTouched] = useState({ password: false, confirm: false })
  const [ok, setOk] = useState(false)
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const passwordRef = useRef<HTMLInputElement>(null)
  const confirmRef = useRef<HTMLInputElement>(null)
  const doneRef = useRef<HTMLAnchorElement>(null)

  useEffect(() => {
    if (router.isReady) setToken(typeof router.query.token === 'string' ? router.query.token : '')
  }, [router.isReady, router.query.token])

  useEffect(() => {
    if (ok) doneRef.current?.focus()
  }, [ok])

  const passwordError =
    touched.password && password.length < MIN_LENGTH
      ? `Use at least ${MIN_LENGTH} characters (${password.length} so far).`
      : password.length > MAX_LENGTH
        ? `Use at most ${MAX_LENGTH} characters.`
        : ''
  const confirmError = touched.confirm && confirm !== password ? 'The passwords don’t match.' : ''

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (submitting) return
    setTouched({ password: true, confirm: true })
    setError('')
    if (password.length < MIN_LENGTH || password.length > MAX_LENGTH)
      return passwordRef.current?.focus()
    if (confirm !== password) return confirmRef.current?.focus()
    setSubmitting(true)
    try {
      const res = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, password }),
      })
      if (res.ok) {
        setOk(true)
        return
      }
      const data = await res.json().catch(() => ({}))
      setError(resetPasswordErrorMessage(res.status, data?.error))
    } catch {
      setError(NETWORK_ERROR)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <>
      <CustomHead title="Reset password" noindex />
      <HeaderFooter>
        <AuthCard
          title="Choose a new password"
          subtitle={`At least ${MIN_LENGTH} characters. A passphrase works well.`}
        >
          {ok ? (
            <VStack align="stretch" spacing={4} role="status" aria-live="polite">
              <Alert
                status="success"
                variant="left-accent"
                borderRadius="md"
                fontSize="13px"
                bg="page.bg-elevated"
              >
                <AlertIcon />
                <AlertDescription>
                  Password updated. Sign in with the new password.
                </AlertDescription>
              </Alert>
              <Button as={NextLink} href="/admin/login" ref={doneRef} {...primaryButtonProps}>
                Sign in
              </Button>
            </VStack>
          ) : router.isReady && !token ? (
            <Alert
              status="warning"
              variant="left-accent"
              borderRadius="md"
              fontSize="13px"
              bg="page.bg-elevated"
              role="alert"
            >
              <AlertIcon />
              <AlertDescription>
                This reset link is incomplete.{' '}
                {/* Underlined: inside a sentence, colour alone does not set a link apart (WCAG 1.4.1). */}
                <Link as={NextLink} href="/admin/forgot" color="accent.text" textDecoration="underline" textUnderlineOffset="2px">
                  Request a new one
                </Link>
                .
              </AlertDescription>
            </Alert>
          ) : (
            <>
              <AuthError>{error}</AuthError>
              <form onSubmit={onSubmit} noValidate>
                <VStack align="stretch" spacing={4}>
                  <PasswordField
                    label="New password"
                    name="new-password"
                    autoComplete="new-password"
                    inputRef={passwordRef}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    onBlur={() =>
                      setTouched((t) => ({ ...t, password: password.length > 0 || t.password }))
                    }
                    error={passwordError}
                    helper={`${MIN_LENGTH}–${MAX_LENGTH} characters.`}
                    isDisabled={submitting}
                    isRequired
                    autoFocus
                  />
                  <PasswordField
                    label="Confirm password"
                    name="confirm-password"
                    autoComplete="new-password"
                    inputRef={confirmRef}
                    value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                    onBlur={() =>
                      setTouched((t) => ({ ...t, confirm: confirm.length > 0 || t.confirm }))
                    }
                    error={confirmError}
                    isDisabled={submitting}
                    isRequired
                  />
                  <AuthSubmit isLoading={submitting} loadingText="Updating…" isDisabled={!token}>
                    Update password
                  </AuthSubmit>
                </VStack>
              </form>
            </>
          )}
        </AuthCard>
      </HeaderFooter>
    </>
  )
}
