import { useEffect, useState } from 'react'
import { Box, Button, Flex, Heading, Input, Text, VStack, Alert, AlertIcon, Link, HStack } from '@chakra-ui/react'
import HeaderFooter from '../../layout/HeaderFooter'
import CustomHead from '../../components/General-UI/CustomHead'

export default function AdminLogin() {
  const [isMobile] = [false]
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  useEffect(() => {
    // Check with server if jwt cookie exists and is valid (not expired)
    const checkSession = async () => {
      try {
        const res = await fetch('/api/admin/session')
        if (res.ok) {
          window.location.replace('/admin')
        }
      } catch {
        // ignore network errors; stay on login
      }
    }
    checkSession()
  }, [])

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    const res = await fetch('/api/auth/email-login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }) })
    if (res.ok) {
      window.location.href = '/admin'
    } else {
      const data = await res.json().catch(() => ({}))
      setError(data?.error || 'Login failed')
    }
  }

  return (
    <>
      <CustomHead title="Admin Login" description="Authenticate to edit CV data" robots="noindex,nofollow" />
      <HeaderFooter isMobile={isMobile}>
        <Flex align="center" justify="center" p={10}>
          <Box maxW="md" w="full">
            <Heading size="md" mb={4}>Admin Login</Heading>
            {error && (
              <Alert status="error" mb={3}><AlertIcon />{error}</Alert>
            )}
            <form onSubmit={onSubmit}>
              <VStack align="stretch" spacing={3}>
                <Input placeholder="Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
                <Input placeholder="Password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
                <Button type="submit" colorScheme="blue">Sign in</Button>
              </VStack>
            </form>
            <HStack mt={3} justify="space-between">
              <Text color="gray.500">Use env ADMIN_EMAIL/ADMIN_PASS</Text>
              <Link href="/admin/forgot" color="blue.400">Forgot password?</Link>
            </HStack>
          </Box>
        </Flex>
      </HeaderFooter>
    </>
  )
}
