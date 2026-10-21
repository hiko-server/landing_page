import { useEffect, useId, useMemo, useRef, useState } from 'react'
import {
  Box,
  Button,
  Flex,
  Heading,
  HStack,
  Input,
  InputGroup,
  InputLeftElement,
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
import { SearchIcon } from '@chakra-ui/icons'
import { DASHBOARD_TABS } from './dashboardTabs'
import { EDITOR_GROUP_TITLE, adminShortcutGroups, filterShortcutGroups, isHelpShortcut, type ShortcutGroup, type ShortcutItem } from './shortcuts'
import { useAdminChords, useAdminCommands } from './useAdminCommands'
import { useShortcutsEnabled } from '../../Chrome/useShortcutsEnabled'
import { getShortcutsEnabled, isImeComposing, setShortcutsEnabled } from '../../../lib/keyboardShortcuts'

/**
 * "?" keyboard shortcuts overlay for every admin page (mounted by the admin
 * title bar and the /admin index). Lists the bindings the admin really
 * implements (shortcuts.ts adminShortcutGroups plus the authoring group
 * below), with ⌘ / Ctrl labels for the current platform, and a search field
 * (type "archive", "G", "⌘"). Chakra Modal: focus is trapped while open and
 * returns to the trigger on close.
 *
 * Mounted on every admin page, it also runs the admin's "G then <key>"
 * navigation (useAdminChords) and puts "Keyboard shortcuts" in the ⌘K menu.
 *
 * Its switch turns every single-character shortcut off and on (WCAG 2.1.4,
 * lib/keyboardShortcuts) — "?" and the G chords included; the trigger button
 * and the ⌘K palette still open this sheet and that setting.
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
 * Every group the overlay shows: the shared admin groups — with the editor
 * group's bindings that the authoring group lists again removed (so each is
 * listed once, with the precise wording above), empty groups dropped — then
 * the authoring group. (⌘K is both the command menu and, in the Visual
 * editor, the link form: both are listed, under their own context.)
 */
export function overlayShortcutGroups(isMac: boolean, tabCount: number): ShortcutGroup[] {
  const authoring = authoringShortcutGroup(isMac)
  const authoringKeys = new Set(authoring.items.map(bindingKey))
  const shared = adminShortcutGroups(isMac, tabCount)
    .map((g) => (g.title === EDITOR_GROUP_TITLE ? { ...g, items: g.items.filter((it) => !authoringKeys.has(bindingKey(it))) } : g))
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
  const [query, setQuery] = useState('')
  const isMac = usePlatformIsMac()
  const shortcutsOn = useShortcutsEnabled()
  const switchId = useId()
  const searchRef = useRef<HTMLInputElement>(null)

  useAdminChords()
  useAdminCommands('shortcuts', [{ id: 'show', label: 'Keyboard shortcuts', hint: 'every key, searchable', shortcut: '?', keywords: 'keys hotkeys help cheat sheet', run: () => setOpen(true) }], 'v1')
  useEffect(() => {
    if (!open) setQuery('')
  }, [open])

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

  const groups = useMemo(() => filterShortcutGroups(overlayShortcutGroups(isMac, DASHBOARD_TABS.length), query.trim()), [isMac, query])

  return (
    <>
      {showTrigger ? (
        <Button
          size="sm"
          variant="ghost"
          // From lg up, where the header has room for it (it never wraps onto a row of its own); "?" opens it everywhere.
          display={{ base: 'none', lg: 'inline-flex' }}
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
      <Modal isOpen={open} onClose={() => setOpen(false)} size="2xl" scrollBehavior="inside" isCentered motionPreset="none" initialFocusRef={searchRef}>
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
                  ? and G then a letter here, list and Inbox letters, / on the site, E on a post. Keys with {isMac ? '⌘ / ⌃ / ⌥' : 'Ctrl / Alt'} always work.
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
            <InputGroup size="sm" mb={5}>
              <InputLeftElement pointerEvents="none">
                <SearchIcon color="page.fg-secondary" boxSize={3} />
              </InputLeftElement>
              <Input
                ref={searchRef}
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search shortcuts — “archive”, “G”, “reply”"
                aria-label="Search keyboard shortcuts"
                focusBorderColor="accent.500"
                maxLength={60}
              />
            </InputGroup>
            {groups.length === 0 ? (
              <Text fontSize="sm" color="page.fg-secondary" textAlign="center" py={6} role="status">
                No shortcut matches “{query.trim()}”.
              </Text>
            ) : null}
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
