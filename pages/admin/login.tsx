import { useEffect, useState } from 'react'
import {
  Box,
  Button,
  Flex,
  Heading,
  Input,
  VStack,
  Alert,
  AlertIcon,
  Link,
  HStack,
} from '@chakra-ui/react'
import { useRouter } from 'next/router'
import HeaderFooter from '../../layout/HeaderFooter'
import CustomHead from '../../components/General-UI/CustomHead'

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
  const [isMobile] = [false]
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    // If the cookie is already valid, bounce straight to the target
    // (either ?next=… preserved from middleware, or /admin).
    const checkSession = async () => {
      try {
        const res = await fetch('/api/admin/session')
        if (res.ok) {
          window.location.replace(safeNextPath(router.query.next))
        }
      } catch {
        // ignore network errors; stay on login
      }
    }
    checkSession()
    // router.query.next is stable after isReady; safe to read once on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router.isReady])

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
      setError(data?.error || 'Login failed')
    } catch (err: any) {
      setError(err?.message || 'Network error')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <>
      <CustomHead title="Admin Login" description="Authenticate to edit CV data" />
      <HeaderFooter isMobile={isMobile}>
        <Flex align="center" justify="center" p={10}>
          <Box maxW="md" w="full">
            <Heading size="md" mb={4}>Admin Login</Heading>
            {error && (
              <Alert status="error" mb={3}><AlertIcon />{error}</Alert>
            )}
            <form onSubmit={onSubmit}>
              <VStack align="stretch" spacing={3}>
                <Input
                  placeholder="Email"
                  type="email"
                  autoComplete="username"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  isDisabled={submitting}
                />
                <Input
                  placeholder="Password"
                  type="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  isDisabled={submitting}
                />
                <Button type="submit" colorScheme="blue" isLoading={submitting} loadingText="Signing in…">
                  Sign in
                </Button>
              </VStack>
            </form>
            <HStack mt={3} justify="flex-end">
              <Link href="/admin/forgot" color="blue.400">Forgot password?</Link>
            </HStack>
          </Box>
        </Flex>
      </HeaderFooter>
    </>
  )
}
