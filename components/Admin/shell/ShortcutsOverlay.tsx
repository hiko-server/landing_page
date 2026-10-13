import React, { useEffect, useState } from 'react'
import {
  Box,
  Button,
  Flex,
  Heading,
  HStack,
  Kbd,
  Modal,
  ModalBody,
  ModalCloseButton,
  ModalContent,
  ModalHeader,
  ModalOverlay,
  SimpleGrid,
  Text,
} from '@chakra-ui/react'
import { DASHBOARD_TABS } from './dashboardTabs'
import { adminShortcutGroups, isHelpShortcut } from './shortcuts'

/**
 * "?" keyboard shortcuts overlay for every admin page (mounted by the admin
 * title bar and the /admin index). Lists the bindings the admin really
 * implements (shortcuts.ts adminShortcutGroups), with ⌘ / Ctrl labels for
 * the current platform. Chakra Modal: focus is trapped while open and
 * returns to the trigger on close.
 */

const MONO = 'var(--font-geist-mono), ui-monospace, "SF Mono", Consolas, monospace'

function isEditable(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null
  if (!el || typeof el.closest !== 'function') return false
  return !!el.closest('input, textarea, select, [contenteditable=""], [contenteditable="true"], [role="textbox"]')
}

function usePlatformIsMac(): boolean {
  const [isMac, setIsMac] = useState(false)
  useEffect(() => {
    const nav = navigator as Navigator & { userAgentData?: { platform?: string } }
    setIsMac(/mac|iphone|ipad|ipod/i.test(nav.userAgentData?.platform || nav.platform || nav.userAgent))
  }, [])
  return isMac
}

export default function ShortcutsOverlay({ showTrigger = true }: { showTrigger?: boolean }) {
  const [open, setOpen] = useState(false)
  const isMac = usePlatformIsMac()

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.repeat) return
      if (!isHelpShortcut(e, isEditable(e.target))) return
      // Another dialog owns the keyboard (its own focus trap); don't stack.
      if (!open && document.querySelector('[role="dialog"][aria-modal="true"], [role="alertdialog"]')) return
      e.preventDefault()
      setOpen((v) => !v)
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open])

  const groups = adminShortcutGroups(isMac, DASHBOARD_TABS.length)

  return (
    <>
      {showTrigger ? (
        <Button
          size="sm"
          variant="ghost"
          display={{ base: 'none', md: 'inline-flex' }}
          color="page.fg-secondary"
          _hover={{ color: 'page.fg', bg: 'page.bg-overlay' }}
          onClick={() => setOpen(true)}
          aria-label="Keyboard shortcuts"
          aria-keyshortcuts="Shift+?"
          aria-haspopup="dialog"
          px={2}
        >
          <Kbd fontSize="11px" bg="page.bg-elevated" borderColor="page.border-strong" color="page.fg-secondary">
            ?
          </Kbd>
        </Button>
      ) : null}
      <Modal isOpen={open} onClose={() => setOpen(false)} size="2xl" scrollBehavior="inside" isCentered motionPreset="none">
        <ModalOverlay />
        <ModalContent bg="page.bg-elevated" border="1px solid" borderColor="page.border" mx={4}>
          <ModalHeader pb={2}>
            <Text as="span" display="block" fontFamily={MONO} fontSize="10px" letterSpacing="0.16em" textTransform="uppercase" color="accent.text">
              [keys]
            </Text>
            <Heading as="h2" fontSize="lg" fontWeight={600} letterSpacing="-0.01em">
              Keyboard shortcuts
            </Heading>
          </ModalHeader>
          <ModalCloseButton />
          <ModalBody pb={6}>
            <SimpleGrid columns={{ base: 1, md: 2 }} spacingX={8} spacingY={6}>
              {groups.map((g) => (
                <Box as="section" key={g.title} aria-label={g.title}>
                  <Text
                    as="h3"
                    fontFamily={MONO}
                    fontSize="11px"
                    letterSpacing="0.12em"
                    textTransform="uppercase"
                    color="page.fg-secondary"
                    pb={2}
                    mb={2}
                    borderBottom="1px solid"
                    borderColor="page.border"
                  >
                    {g.title}
                  </Text>
                  <Box as="dl">
                    {g.items.map((it) => (
                      <Flex key={`${it.label}-${it.keys.join('+')}`} as="div" align="center" justify="space-between" gap={4} py={1.5}>
                        <Text as="dt" fontSize="sm" color="page.fg">
                          {it.label}
                        </Text>
                        <HStack as="dd" spacing={1} flexShrink={0}>
                          {it.keys.map((k) => (
                            <Kbd
                              key={k}
                              fontSize="11px"
                              fontFamily={MONO}
                              className="tnum"
                              bg="page.bg"
                              borderColor="page.border-strong"
                              color="page.fg-secondary"
                            >
                              {k}
                            </Kbd>
                          ))}
                        </HStack>
                      </Flex>
                    ))}
                  </Box>
                </Box>
              ))}
            </SimpleGrid>
          </ModalBody>
        </ModalContent>
      </Modal>
    </>
  )
}
