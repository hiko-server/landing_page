import { useState } from 'react'
import { Alert, AlertIcon, Link, VStack } from '@chakra-ui/react'
import NextLink from 'next/link'
import HeaderFooter from '../../layout/HeaderFooter'
import CustomHead from '../../components/General-UI/CustomHead'
import { AuthCard, AuthError, AuthField, AuthSubmit } from '../../components/Admin/AuthCard'

export default function Forgot() {
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setSubmitting(true)
    try {
      const res = await fetch('/api/auth/request-reset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      })
      if (res.ok) setSent(true)
      else {
        const data = await res.json().catch(() => ({}))
        setError(data?.error || `Request failed (${res.status})`)
      }
    } catch (err: any) {
      setError(err?.message || 'Network error')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <>
      <CustomHead title="Forgot Password" noindex />
      <HeaderFooter>
        <AuthCard
          title="Reset your password"
          subtitle="We’ll email a single-use link that expires in 30 minutes."
          footer={
            <Link as={NextLink} href="/admin/login" color="var(--accent)">
              ← Back to sign in
            </Link>
          }
        >
          {sent ? (
            <Alert status="success" borderRadius="md" fontSize="13px">
              <AlertIcon />
              If that address belongs to the admin, a reset link is on its way.
            </Alert>
          ) : (
            <>
              <AuthError>{error}</AuthError>
              <form onSubmit={onSubmit} noValidate>
                <VStack align="stretch" spacing={4}>
                  <AuthField
                    label="Admin email"
                    type="email"
                    autoComplete="username"
                    inputMode="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    isDisabled={submitting}
                    isRequired
                    autoFocus
                  />
                  <AuthSubmit isLoading={submitting} isDisabled={!email.trim()}>
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
