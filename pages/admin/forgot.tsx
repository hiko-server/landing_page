import { useState } from 'react'
import { Button, Flex, Heading, Input, Text, VStack, Alert, AlertIcon } from '@chakra-ui/react'
import HeaderFooter from '../../layout/HeaderFooter'
import CustomHead from '../../components/General-UI/CustomHead'

export default function Forgot() {
  const [isMobile] = [false]
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [error, setError] = useState('')

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    const res = await fetch('/api/auth/request-reset', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email }) })
    if (res.ok) setSent(true)
    else setError('Request failed')
  }

  return (
    <>
      <CustomHead title="Forgot Password" />
      <HeaderFooter isMobile={isMobile}>
        <Flex align="center" justify="center" p={10}>
          <VStack spacing={4} maxW="md" w="full">
            <Heading size="md">Reset Password</Heading>
            {sent ? (
              <Alert status="success"><AlertIcon />If the email exists, a reset link has been sent.</Alert>
            ) : (
              <form onSubmit={onSubmit}>
                <VStack align="stretch" spacing={3}>
                  <Input placeholder="Email" type="email" value={email} onChange={(e)=> setEmail(e.target.value)} />
                  <Button type="submit" colorScheme="blue">Send Reset Link</Button>
                </VStack>
              </form>
            )}
            {error && <Text color="red.400">{error}</Text>}
          </VStack>
        </Flex>
      </HeaderFooter>
    </>
  )
}

