import { useRef, useState } from 'react'
import {
  Box,
  Button,
  Checkbox,
  Flex,
  Modal,
  ModalBody,
  ModalContent,
  ModalFooter,
  ModalHeader,
  ModalOverlay,
  SimpleGrid,
  Text,
} from '@chakra-ui/react'
import { MONO, outlineButtonProps, primaryButtonProps } from '../shell/ui'
import { recoveryCodesText } from './securityFormat'

/**
 * Shows a fresh set of recovery codes exactly once: copy, download as a text
 * file (made in the browser, never sent anywhere), and a confirmation before
 * the dialog can close — the server keeps only hashes, so a lost set can only
 * be replaced.
 */
export default function RecoveryCodesDialog({
  codes,
  site,
  onClose,
}: {
  codes: string[]
  site: string
  onClose: () => void
}) {
  const [saved, setSaved] = useState(false)
  const [copied, setCopied] = useState(false)
  const createdAt = useRef(Date.now()).current
  const text = recoveryCodesText(codes, site, createdAt)

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
    } catch {
      setCopied(false)
    }
  }

  const download = () => {
    const url = URL.createObjectURL(new Blob([text], { type: 'text/plain;charset=utf-8' }))
    const a = document.createElement('a')
    a.href = url
    a.download = `${site.replace(/[^a-z0-9.-]+/gi, '-')}-recovery-codes.txt`
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(url)
  }

  return (
    <Modal
      isOpen
      onClose={() => saved && onClose()}
      isCentered
      size="lg"
      closeOnOverlayClick={false}
      closeOnEsc={saved}
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
            [recovery codes]
          </Text>
          <Text as="span" fontSize="lg" fontWeight={600} letterSpacing="-0.02em">
            Save your recovery codes
          </Text>
        </ModalHeader>
        <ModalBody>
          <Text fontSize="sm">
            Each code signs in once, together with your password, when you can’t use a passkey. This
            is the only time they are shown — store them offline or in a password manager.
          </Text>
          <SimpleGrid
            as="ol"
            listStyleType="none"
            columns={{ base: 1, sm: 2 }}
            spacingX={6}
            spacingY={1.5}
            mt={4}
            p={4}
            border="1px solid"
            borderColor="page.border"
            borderRadius="md"
            bg="page.bg"
            aria-label="Recovery codes"
          >
            {codes.map((c, i) => (
              <Box
                as="li"
                key={c}
                fontFamily={MONO}
                fontSize="sm"
                className="tnum"
                letterSpacing="0.04em"
              >
                <Box as="span" color="page.fg-secondary" mr={2} aria-hidden>
                  {String(i + 1).padStart(2, '0')}
                </Box>
                {c}
              </Box>
            ))}
          </SimpleGrid>
          <Flex gap={2} mt={3} flexWrap="wrap">
            <Button size="sm" {...outlineButtonProps} onClick={() => void copy()}>
              {copied ? 'Copied' : 'Copy all'}
            </Button>
            <Button size="sm" {...outlineButtonProps} onClick={download}>
              Download .txt
            </Button>
          </Flex>
          <Box role="status" aria-live="polite" srOnly>
            {copied ? 'Recovery codes copied to the clipboard.' : ''}
          </Box>
          <Checkbox
            mt={5}
            isChecked={saved}
            onChange={(e) => setSaved(e.target.checked)}
            colorScheme="purple"
          >
            <Text as="span" fontSize="sm">
              I have saved these codes somewhere safe
            </Text>
          </Checkbox>
        </ModalBody>
        <ModalFooter>
          <Button {...primaryButtonProps} onClick={onClose} isDisabled={!saved}>
            Done
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  )
}
