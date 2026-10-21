import { useRef, useState } from 'react'
import { Alert, AlertDescription, AlertIcon, Box, Link, VStack } from '@chakra-ui/react'
import NextLink from 'next/link'
import HeaderFooter from '../../layout/HeaderFooter'
import CustomHead from '../../components/General-UI/CustomHead'
import { AuthCard, AuthError, AuthField, AuthSubmit } from '../../components/Admin/AuthCard'
import { NETWORK_ERROR, resetRequestErrorMessage } from '../../components/Admin/shell/authMessages'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export default function Forgot() {
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [error, setError] = useState('')
  const [fieldError, setFieldError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const emailRef = useRef<HTMLInputElement>(null)

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (submitting) return
    setError('')
    const value = email.trim()
    const invalid = !value
      ? 'Enter your email address.'
      : !EMAIL_RE.test(value)
        ? 'Enter a valid email address.'
        : ''
    setFieldError(invalid)
    if (invalid) {
      emailRef.current?.focus()
      return
    }
    setSubmitting(true)
    try {
      const res = await fetch('/api/auth/request-reset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: value }),
      })
      if (res.ok) setSent(true)
      else setError(resetRequestErrorMessage(res.status))
    } catch {
      setError(NETWORK_ERROR)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <>
      <CustomHead title="Forgot password" noindex />
      <HeaderFooter>
        <AuthCard
          title="Reset your password"
          subtitle="We’ll email a single-use link that expires in 30 minutes."
          footer={
            <Link as={NextLink} href="/admin/login" color="accent.text">
              ← Back to sign in
            </Link>
          }
        >
          {/* Same message whether or not the address is the admin's — no account probing. */}
          <Box role="status" aria-live="polite">
            {sent ? (
              <Alert
                status="success"
                variant="left-accent"
                borderRadius="md"
                fontSize="13px"
                bg="page.bg-elevated"
              >
                <AlertIcon />
                <AlertDescription>
                  If that address belongs to the admin, a reset link is on its way. Check your inbox
                  and spam folder.
                </AlertDescription>
              </Alert>
            ) : null}
          </Box>
          {sent ? null : (
            <>
              <AuthError>{error}</AuthError>
              <form onSubmit={onSubmit} noValidate>
                <VStack align="stretch" spacing={4}>
                  <AuthField
                    label="Admin email"
                    type="email"
                    name="email"
                    autoComplete="email"
                    inputMode="email"
                    autoCapitalize="none"
                    autoCorrect="off"
                    spellCheck={false}
                    inputRef={emailRef}
                    value={email}
                    onChange={(e) => {
                      setEmail(e.target.value)
                      if (fieldError) setFieldError('')
                    }}
                    error={fieldError}
                    isDisabled={submitting}
                    isRequired
                    autoFocus
                  />
                  <AuthSubmit isLoading={submitting} loadingText="Sending…">
                    Send reset link
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
