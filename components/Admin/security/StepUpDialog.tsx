import { useRef, useState } from 'react'
import {
  Box,
  Button,
  Flex,
  Modal,
  ModalBody,
  ModalCloseButton,
  ModalContent,
  ModalFooter,
  ModalHeader,
  ModalOverlay,
  Text,
  VStack,
} from '@chakra-ui/react'
import { AuthError, AuthField, PasswordField } from '../AuthCard'
import { MONO, primaryButtonProps } from '../shell/ui'
import { readJsonObject } from '../shell/http'
import { NETWORK_ERROR } from '../shell/authMessages'
import { KeyIcon } from './icons'
import type { StepUpChallenge } from './stepUpClient'
import {
  describeWebAuthnError,
  getAssertion,
  isCeremonyCancelled,
  passkeysPossibleHere,
} from './webauthnClient'

/**
 * "Confirm it's you" — re-verification before a dangerous admin action
 * (lib/adminAuth/stepUp.ts). Offers what sign-in accepts: a passkey, or the
 * password (plus a recovery code when "Require a passkey" is on). Opens with
 * focus on the first way to verify; Esc or Cancel resolves "not verified".
 */
export default function StepUpDialog({
  reason,
  challenge,
  onDone,
}: {
  reason: string
  challenge: StepUpChallenge
  onDone: (ok: boolean) => void
}) {
  const canPasskey = challenge.methods.includes('passkey') && passkeysPossibleHere()
  const canPassword = challenge.methods.includes('password')
  const [busy, setBusy] = useState<'passkey' | 'password' | null>(null)
  const [error, setError] = useState('')
  const [password, setPassword] = useState('')
  const [code, setCode] = useState('')
  const passkeyRef = useRef<HTMLButtonElement>(null)
  const passwordRef = useRef<HTMLInputElement>(null)

  const verify = async (body: Record<string, unknown>): Promise<boolean> => {
    const res = await fetch('/api/admin/security/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    const json = await readJsonObject(res)
    if (res.ok && json.ok) return true
    setError(
      typeof json.error === 'string' ? json.error : `Verification failed (HTTP ${res.status}).`
    )
    return false
  }

  const verifyWithPasskey = async () => {
    if (busy) return
    setBusy('passkey')
    setError('')
    try {
      const res = await fetch('/api/admin/security/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'options' }),
      })
      const json = await readJsonObject(res)
      if (!res.ok || !json.options) {
        setError(
          typeof json.error === 'string'
            ? json.error
            : `Could not start the passkey check (HTTP ${res.status}).`
        )
        return
      }
      let response: unknown
      try {
        response = await getAssertion(json.options)
      } catch (err) {
        setError(
          isCeremonyCancelled(err)
            ? 'The passkey prompt was closed. Try again, or use your password.'
            : describeWebAuthnError(err)
        )
        return
      }
      if (await verify({ method: 'passkey', response })) onDone(true)
    } catch {
      setError(NETWORK_ERROR)
    } finally {
      setBusy(null)
    }
  }

  const verifyWithPassword = async (e: React.FormEvent) => {
    e.preventDefault()
    if (busy) return
    if (!password) {
      setError('Enter your password.')
      passwordRef.current?.focus()
      return
    }
    if (challenge.recoveryRequired && !code.trim()) {
      setError('Enter one of your recovery codes.')
      return
    }
    setBusy('password')
    setError('')
    try {
      const ok = await verify({
        method: 'password',
        password,
        ...(challenge.recoveryRequired ? { recoveryCode: code } : {}),
      })
      if (ok) onDone(true)
      else requestAnimationFrame(() => passwordRef.current?.select())
    } catch {
      setError(NETWORK_ERROR)
    } finally {
      setBusy(null)
    }
  }

  return (
    <Modal
      isOpen
      onClose={() => onDone(false)}
      isCentered
      size="md"
      initialFocusRef={canPasskey ? passkeyRef : passwordRef}
      closeOnOverlayClick={!busy}
    >
      <ModalOverlay />
      <ModalContent bg="page.bg-elevated" border="1px solid" borderColor="page.border" mx={4}>
        <ModalHeader pb={1}>
          <Text
            as="span"
            display="block"
            fontFamily={MONO}
            fontSize="10px"
            letterSpacing="0.16em"
            textTransform="uppercase"
            color="accent.text"
          >
            [security]
          </Text>
          <Text as="span" fontSize="lg" fontWeight={600} letterSpacing="-0.02em">
            Confirm it’s you
          </Text>
        </ModalHeader>
        <ModalCloseButton isDisabled={!!busy} />
        <ModalBody>
          <Text fontSize="sm">{reason}</Text>
          <Text fontSize="xs" color="page.fg-secondary" mt={1.5} mb={4}>
            Actions like this need a sign-in or a check from the last{' '}
            {challenge.windowMinutes === 1 ? 'minute' : `${challenge.windowMinutes} minutes`}.
          </Text>
          <AuthError>{error}</AuthError>
          {canPasskey ? (
            <Button
              ref={passkeyRef}
              w="full"
              leftIcon={<KeyIcon />}
              onClick={() => void verifyWithPasskey()}
              isLoading={busy === 'passkey'}
              loadingText="Waiting for your passkey…"
              isDisabled={busy === 'password'}
              {...primaryButtonProps}
            >
              Use a passkey
            </Button>
          ) : null}
          {canPasskey && canPassword ? (
            <Flex align="center" gap={3} my={4} aria-hidden>
              <Box flex={1} h="1px" bg="page.border" />
              <Text
                fontFamily={MONO}
                fontSize="10px"
                letterSpacing="0.12em"
                textTransform="uppercase"
                color="page.fg-secondary"
              >
                or your password
              </Text>
              <Box flex={1} h="1px" bg="page.border" />
            </Flex>
          ) : null}
          {canPassword ? (
            <form onSubmit={verifyWithPassword} noValidate aria-label="Confirm with your password">
              <VStack align="stretch" spacing={3}>
                {/* A hidden username field lets password managers fill the right account. */}
                <input
                  type="text"
                  name="username"
                  autoComplete="username"
                  hidden
                  readOnly
                  value=""
                />
                <PasswordField
                  label="Password"
                  name="password"
                  autoComplete="current-password"
                  inputRef={passwordRef}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  isDisabled={!!busy}
                />
                {challenge.recoveryRequired ? (
                  <AuthField
                    label="Recovery code"
                    name="recovery-code"
                    autoComplete="one-time-code"
                    autoCapitalize="characters"
                    autoCorrect="off"
                    spellCheck={false}
                    fontFamily={MONO}
                    placeholder="XXXX-XXXX-XXXX-XXXX"
                    value={code}
                    onChange={(e) => setCode(e.target.value)}
                    isDisabled={!!busy}
                    helper="“Require a passkey” is on: the password needs one of your recovery codes (each works once)."
                  />
                ) : null}
                <Button
                  type="submit"
                  variant={canPasskey ? 'outline' : 'solid'}
                  isLoading={busy === 'password'}
                  loadingText="Checking…"
                  isDisabled={busy === 'passkey'}
                  {...(canPasskey ? { borderColor: 'page.border-strong' } : primaryButtonProps)}
                >
                  Confirm with password
                </Button>
              </VStack>
            </form>
          ) : null}
        </ModalBody>
        <ModalFooter>
          <Button variant="ghost" onClick={() => onDone(false)} isDisabled={!!busy}>
            Cancel
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  )
}
