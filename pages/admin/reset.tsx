import { useRouter } from 'next/router'
import { useEffect, useState } from 'react'
import { Button, Flex, Heading, Input, Text, VStack, Alert, AlertIcon } from '@chakra-ui/react'
import HeaderFooter from '../../layout/HeaderFooter'
import CustomHead from '../../components/General-UI/CustomHead'

export default function ResetPassword() {
  const [isMobile] = [false]
  const router = useRouter()
  const [token, setToken] = useState('')
  const [password, setPassword] = useState('')
  const [ok, setOk] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (router.isReady) {
      const t = (router.query.token as string) || ''
      setToken(t)
    }
  }, [router.isReady, router.query.token])

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    const res = await fetch('/api/auth/reset-password', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token, password }) })
    setOk(res.ok)
    if (!res.ok) setError('Reset failed')
  }

  return (
    <>
      <CustomHead title="Reset Password" />
      <HeaderFooter isMobile={isMobile}>
        <Flex align="center" justify="center" p={10}>
          <VStack spacing={4} maxW="md" w="full">
            <Heading size="md">Set New Password</Heading>
            {ok ? (
              <Alert status="success"><AlertIcon />Password updated. You can now login.</Alert>
            ) : (
              <form onSubmit={onSubmit}>
                <VStack align="stretch" spacing={3}>
                  <Input placeholder="New Password" type="password" value={password} onChange={(e)=> setPassword(e.target.value)} />
                  <Button type="submit" colorScheme="blue" isDisabled={!token}>Update Password</Button>
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

