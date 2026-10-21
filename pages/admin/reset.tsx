import { useRouter } from 'next/router'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Alert, AlertDescription, AlertIcon, Box, Button, Link, Spinner, VStack } from '@chakra-ui/react'
import NextLink from 'next/link'
import HeaderFooter from '../../layout/HeaderFooter'
import CustomHead from '../../components/General-UI/CustomHead'
import { AuthCard, AuthError, AuthSubmit, PasswordField } from '../../components/Admin/AuthCard'
import { NETWORK_ERROR, resetPasswordErrorMessage } from '../../components/Admin/shell/authMessages'
import { primaryButtonProps } from '../../components/Admin/shell/ui'
import PasswordChecklist from '../../components/Admin/security/PasswordChecklist'
import { passwordRules } from '../../components/Admin/security/passwordRules'
import {
  checkNewPassword,
  PASSWORD_ISSUE_MESSAGES,
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
  passwordIssues,
} from '../../lib/adminAuth/passwordPolicy'

/**
 * /admin/reset?token=… — the e-mailed link: choose a new password.
 *
 * The same rules as Admin → Security → Password (lib/adminAuth/passwordPolicy)
 * with the same live checklist (PasswordChecklist): length, not common or
 * predictable, not the site's name — the e-mail's name is unknown before
 * sign-in, so for that one rule the server is the judge, and its refusal
 * lands on the New password field like any other. A field's error is set on
 * submit and only cleared once the field passes (never swapped while
 * typing); nothing is disabled while the request runs, so focus never falls
 * back to the page — a refused password focuses and selects the field.
 */
const MIN_LENGTH = PASSWORD_MIN_LENGTH
const MAX_LENGTH = PASSWORD_MAX_LENGTH
const RULES_ID = 'reset-password-rules'
/** "Fill this in" errors: they stop applying at the first character typed. */
const EMPTY_PASSWORD = 'Enter a new password.'
const EMPTY_CONFIRM = 'Type the new password again.'

export default function ResetPassword() {
  const router = useRouter()
  const [token, setToken] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [passwordError, setPasswordError] = useState('')
  const [confirmError, setConfirmError] = useState('')
  const [ok, setOk] = useState(false)
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  // The site's own name is one of the rules; known only in the browser.
  const [siteHost, setSiteHost] = useState<string | null>(null)
  const passwordRef = useRef<HTMLInputElement>(null)
  const confirmRef = useRef<HTMLInputElement>(null)
  const doneRef = useRef<HTMLAnchorElement>(null)

  useEffect(() => {
    if (router.isReady) setToken(typeof router.query.token === 'string' ? router.query.token : '')
  }, [router.isReady, router.query.token])

  useEffect(() => {
    setSiteHost(window.location.hostname || null)
  }, [])

  useEffect(() => {
    if (ok) doneRef.current?.focus()
  }, [ok])

  const check = useMemo(() => checkNewPassword(password, { siteHost }), [password, siteHost])
  // "Different from the current password" does not apply to a reset.
  const rules = passwordRules(check, MIN_LENGTH, MAX_LENGTH).filter((r) => r.key !== 'current')
  const confirmOk = !!confirm && confirm === password

  // An error goes away once its field passes (and is never replaced while typing);
  // the password's is cleared in its onChange.
  useEffect(() => {
    if (confirmOk) setConfirmError('')
  }, [confirmOk])

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (submitting) return
    setError('')
    const firstIssue = passwordIssues(check)[0]
    const errors = {
      password: !password
        ? EMPTY_PASSWORD
        : firstIssue
          ? PASSWORD_ISSUE_MESSAGES[firstIssue]
          : '',
      confirm: !confirm ? EMPTY_CONFIRM : confirmOk ? '' : 'The passwords don’t match.',
    }
    setPasswordError(errors.password)
    setConfirmError(errors.confirm)
    if (errors.password) return passwordRef.current?.focus()
    if (errors.confirm) return confirmRef.current?.focus()
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
      if (res.status === 400 && data?.code === 'PASSWORD_POLICY') {
        // A rule the page could not check (the e-mail's name): on the field, which takes focus.
        setPasswordError(resetPasswordErrorMessage(res.status, data?.error, data?.code))
        passwordRef.current?.focus()
        passwordRef.current?.select()
        return
      }
      setError(resetPasswordErrorMessage(res.status, data?.error, data?.code))
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
          subtitle={`${MIN_LENGTH}–${MAX_LENGTH} characters, not a common password, and not your e-mail’s name or the site’s name. A passphrase works well.`}
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
                    onChange={(e) => {
                      setPassword(e.target.value)
                      // Cleared once the edited password passes every rule the page can check
                      // (a server refusal then no longer applies either); kept, unchanged, until then.
                      const v = e.target.value
                      if ((v && passwordError === EMPTY_PASSWORD) || checkNewPassword(v, { siteHost }).ok)
                        setPasswordError('')
                    }}
                    error={passwordError}
                    aria-describedby={`${RULES_ID} ${RULES_ID}-strength`}
                    // Read-only, not disabled, while it works: focus stays where it is.
                    isReadOnly={submitting}
                    isRequired
                    autoFocus
                    {...({
                      passwordrules: `minlength: ${MIN_LENGTH}; maxlength: ${MAX_LENGTH};`,
                    } as Record<string, string>)}
                  />
                  <Box>
                    <PasswordChecklist
                      id={RULES_ID}
                      value={password}
                      rules={rules}
                      strength={check.strength}
                    />
                  </Box>
                  <PasswordField
                    label="Confirm password"
                    name="confirm-password"
                    autoComplete="new-password"
                    inputRef={confirmRef}
                    value={confirm}
                    onChange={(e) => {
                      setConfirm(e.target.value)
                      if (e.target.value && confirmError === EMPTY_CONFIRM) setConfirmError('')
                    }}
                    error={confirmError}
                    isReadOnly={submitting}
                    isRequired
                  />
                  {/* Never disabled while it works (focus would fall back to the page): it says so instead. */}
                  <AuthSubmit
                    aria-busy={submitting || undefined}
                    leftIcon={submitting ? <Spinner size="xs" /> : undefined}
                    isDisabled={!token}
                  >
                    {submitting ? 'Updating…' : 'Update password'}
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
