import { useState } from 'react'
import { Box, Button, Flex, Heading, Input, Text, VStack, Alert, AlertIcon } from '@chakra-ui/react'
import HeaderFooter from '../../layout/HeaderFooter'
import CustomHead from '../../components/General-UI/CustomHead'

export default function AdminLogin() {
  const [isMobile] = [false]
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    const res = await fetch('/api/admin/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username, password }) })
    if (res.ok) {
      window.location.href = '/cv/edit'
    } else {
      const data = await res.json().catch(() => ({}))
      setError(data?.error || 'Login failed')
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
                <Input placeholder="Username" value={username} onChange={(e) => setUsername(e.target.value)} />
                <Input placeholder="Password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
                <Button type="submit" colorScheme="blue">Sign in</Button>
              </VStack>
            </form>
            <Text mt={3} color="gray.500">Use credentials configured via env vars.</Text>
          </Box>
        </Flex>
      </HeaderFooter>
    </>
  )
}

