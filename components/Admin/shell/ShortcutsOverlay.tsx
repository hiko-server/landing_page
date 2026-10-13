import { useEffect, useId, useState } from 'react'
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
  Switch,
  Text,
} from '@chakra-ui/react'
import { DASHBOARD_TABS } from './dashboardTabs'
import { adminShortcutGroups, isHelpShortcut, type ShortcutGroup, type ShortcutItem } from './shortcuts'
import { useShortcutsEnabled } from '../../Chrome/useShortcutsEnabled'
import { getShortcutsEnabled, isImeComposing, setShortcutsEnabled } from '../../../lib/keyboardShortcuts'

/**
 * "?" keyboard shortcuts overlay for every admin page (mounted by the admin
 * title bar and the /admin index). Lists the bindings the admin really
 * implements (shortcuts.ts adminShortcutGroups plus the authoring group
 * below), with ⌘ / Ctrl labels for the current platform. Chakra Modal: focus
 * is trapped while open and returns to the trigger on close.
 *
 * Its switch turns every single-character shortcut off and on (WCAG 2.1.4,
 * lib/keyboardShortcuts) — "?" itself included; the trigger button and the
 * ⌘K palette still open this sheet and that setting.
 */

/**
 * Authoring bindings of the writing editors (posts, case studies and the
 * Now / Uses pages — every editor built on RichEditor + LivePreview):
 *   - ⌘⇧P / Ctrl+Shift+P — LivePreview's document keydown listener: shows or
 *     hides the side preview at xl and above, switches the Write | Preview
 *     tabs below xl.
 *   - "/" — opens the block menu in both editor tabs (the Visual tab's slash
 *     extension and the MDX textarea's slash trigger).
 *   - ⌘K / Ctrl+K — RichEditor's ProseMirror handleKeyDown: link form, Visual
 *     tab only.
 */
export function authoringShortcutGroup(isMac: boolean): ShortcutGroup {
  const mod = isMac ? '⌘' : 'Ctrl'
  const shift = isMac ? '⇧' : 'Shift'
  return {
    title: 'Posts, case studies & pages',
    items: [
      { keys: [mod, shift, 'P'], label: 'Show / hide the live preview (Write | Preview on smaller screens)' },
      { keys: ['/'], label: 'Block menu (Visual and MDX tabs)' },
      { keys: [mod, 'K'], label: 'Add or edit a link (Visual tab)' },
    ],
  }
}

const SHIFT_GLYPHS = new Set(['⇧', 'Shift'])

/** Platform-neutral identity of a binding: ⌘/Ctrl and ⇧/Shift compare equal. */
function bindingKey(item: ShortcutItem): string {
  return item.keys.map((k) => (k === '⌘' || k === 'Ctrl' ? 'Mod' : SHIFT_GLYPHS.has(k) ? 'Shift' : k)).join('+')
}

/**
 * Every group the overlay shows: the shared admin groups with any authoring
 * binding removed (so it is listed once, with the precise wording above),
 * empty groups dropped, then the authoring group.
 */
export function overlayShortcutGroups(isMac: boolean, tabCount: number): ShortcutGroup[] {
  const authoring = authoringShortcutGroup(isMac)
  const authoringKeys = new Set(authoring.items.map(bindingKey))
  const shared = adminShortcutGroups(isMac, tabCount)
    .map((g) => ({ ...g, items: g.items.filter((it) => !authoringKeys.has(bindingKey(it))) }))
    .filter((g) => g.items.length > 0)
  return [...shared, authoring]
}

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
  const shortcutsOn = useShortcutsEnabled()
  const switchId = useId()

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.repeat || isImeComposing(e)) return
      if (!isHelpShortcut(e, isEditable(e.target)) || !getShortcutsEnabled()) return
      // Another dialog owns the keyboard (its own focus trap); don't stack.
      if (!open && document.querySelector('[role="dialog"][aria-modal="true"], [role="alertdialog"]')) return
      e.preventDefault()
      setOpen((v) => !v)
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open])

  const groups = overlayShortcutGroups(isMac, DASHBOARD_TABS.length)

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
          aria-keyshortcuts={shortcutsOn ? 'Shift+?' : undefined}
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
            <Flex align="center" justify="space-between" gap={4} mb={6} p={3} border="1px solid" borderColor="page.border" borderRadius="md">
              <Box>
                <Text as="label" htmlFor={switchId} display="block" fontSize="sm" fontWeight={500} color="page.fg" cursor="pointer">
                  Single-key shortcuts
                </Text>
                <Text id={`${switchId}-hint`} fontSize="xs" color="page.fg-secondary">
                  ? here, / and G then a letter on the site, E on a post. Keys with {isMac ? '⌘ / ⌃ / ⌥' : 'Ctrl / Alt'} always work.
                </Text>
              </Box>
              <Switch
                id={switchId}
                isChecked={shortcutsOn}
                onChange={(e) => setShortcutsEnabled(e.target.checked)}
                aria-describedby={`${switchId}-hint`}
                colorScheme="purple"
              />
            </Flex>
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
