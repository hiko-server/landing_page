import { useRouter } from 'next/router'
import { useEffect, useState } from 'react'
import { Alert, AlertIcon, Button, Text, VStack } from '@chakra-ui/react'
import NextLink from 'next/link'
import HeaderFooter from '../../layout/HeaderFooter'
import CustomHead from '../../components/General-UI/CustomHead'
import { AuthCard, AuthError, AuthSubmit, PasswordField } from '../../components/Admin/AuthCard'

const MIN_LENGTH = 12

export default function ResetPassword() {
  const router = useRouter()
  const [token, setToken] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [ok, setOk] = useState(false)
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (router.isReady) setToken((router.query.token as string) || '')
  }, [router.isReady, router.query.token])

  const tooShort = password.length > 0 && password.length < MIN_LENGTH
  const mismatch = confirm.length > 0 && confirm !== password
  const canSubmit = !!token && password.length >= MIN_LENGTH && confirm === password

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!canSubmit) return
    setError('')
    setSubmitting(true)
    try {
      const res = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, password }),
      })
      if (res.ok) setOk(true)
      else {
        const data = await res.json().catch(() => ({}))
        setError(data?.error || `Reset failed (${res.status})`)
      }
    } catch (err: any) {
      setError(err?.message || 'Network error')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <>
      <CustomHead title="Reset Password" noindex />
      <HeaderFooter>
        <AuthCard title="Choose a new password" subtitle={`At least ${MIN_LENGTH} characters. A passphrase works well.`}>
          {ok ? (
            <VStack align="stretch" spacing={4}>
              <Alert status="success" borderRadius="md" fontSize="13px">
                <AlertIcon />
                Password updated.
              </Alert>
              <Button as={NextLink} href="/admin/login" bg="var(--accent)" color="white" _hover={{ opacity: 0.92 }}>
                Sign in
              </Button>
            </VStack>
          ) : router.isReady && !token ? (
            <Alert status="warning" borderRadius="md" fontSize="13px">
              <AlertIcon />
              This reset link is missing its token. Request a new one from “Forgot password”.
            </Alert>
          ) : (
            <>
              <AuthError>{error}</AuthError>
              <form onSubmit={onSubmit} noValidate>
                <VStack align="stretch" spacing={4}>
                  <PasswordField
                    label="New password"
                    autoComplete="new-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    isInvalid={tooShort}
                    isDisabled={submitting}
                    isRequired
                    autoFocus
                  />
                  <PasswordField
                    label="Confirm password"
                    autoComplete="new-password"
                    value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                    isInvalid={mismatch}
                    isDisabled={submitting}
                    isRequired
                  />
                  {tooShort || mismatch ? (
                    <Text fontSize="12px" color="red.400" role="status">
                      {tooShort ? `Use at least ${MIN_LENGTH} characters.` : 'Passwords don’t match.'}
                    </Text>
                  ) : null}
                  <AuthSubmit isLoading={submitting} isDisabled={!canSubmit}>
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
