import { useEffect, useRef, useState } from 'react'
import {
  Box,
  Button,
  Drawer,
  DrawerBody,
  DrawerCloseButton,
  DrawerContent,
  DrawerFooter,
  DrawerHeader,
  DrawerOverlay,
  Flex,
  HStack,
  Text,
  useBreakpointValue,
} from '@chakra-ui/react'
import { ViewIcon } from '@chakra-ui/icons'
import type { CvLang } from '../../../lib/cvVisibility'
import { monoFont, useStudioTokens } from './fields'
import type { HiddenKind, HiddenRow } from './hiddenIndex'

const KIND_LABEL: Record<HiddenKind, string> = {
  'section-cv': 'off CV',
  'section-web': 'off web',
  entry: 'entry',
  field: 'field',
  list: 'list',
  item: 'item',
  limited: 'limited',
}

function groupBySection(rows: HiddenRow[]): Array<{ sectionIdx: number; title: string; rows: HiddenRow[] }> {
  const out: Array<{ sectionIdx: number; title: string; rows: HiddenRow[] }> = []
  for (const row of rows) {
    const last = out[out.length - 1]
    if (last && last.sectionIdx === row.sectionIdx) last.rows.push(row)
    else out.push({ sectionIdx: row.sectionIdx, title: row.crumbs[0] || row.label, rows: [row] })
  }
  return out
}

/**
 * Every hidden section switch, entry, field, list and bullet in EN and 中,
 * in document order. Click a row to jump to it in the editor; "Show" makes
 * it public again (linked mode: in both languages where they line up).
 */
export default function HiddenPanel({
  isOpen,
  onClose,
  rows,
  linked,
  onJump,
  onShow,
}: {
  isOpen: boolean
  onClose: () => void
  rows: HiddenRow[]
  linked: boolean
  onJump: (row: HiddenRow) => void
  onShow: (row: HiddenRow) => void
}) {
  const { border, borderStrong, dim, faint, hiddenFg, hiddenBorder, surfaceAlt } = useStudioTokens()
  const listRef = useRef<HTMLDivElement | null>(null)
  const drawerSize = useBreakpointValue({ base: 'full', md: 'md' }) ?? 'md'
  // After "Show" removes a row, keep keyboard focus at the same position.
  const refocusAt = useRef<number | null>(null)
  // A jump moves focus into the editor, so the drawer must not hand it back
  // to the toolbar button as it closes (it still does for Esc / Close).
  const [jumping, setJumping] = useState(false)
  useEffect(() => {
    if (isOpen) setJumping(false)
  }, [isOpen])

  useEffect(() => {
    const at = refocusAt.current
    if (at === null) return
    refocusAt.current = null
    const buttons = listRef.current?.querySelectorAll<HTMLButtonElement>('[data-show-btn]')
    if (!buttons || !buttons.length) return
    buttons[Math.min(at, buttons.length - 1)]?.focus()
  }, [rows])

  const byLang = (['en', 'zh'] as CvLang[]).map((lang) => ({ lang, rows: rows.filter((r) => r.lang === lang) }))
  let flatIndex = -1

  return (
    <Drawer isOpen={isOpen} onClose={onClose} placement="right" size={drawerSize} returnFocusOnClose={!jumping}>
      <DrawerOverlay />
      <DrawerContent bg="page.bg" borderLeft="1px solid" borderColor={border}>
        <DrawerCloseButton />
        <DrawerHeader borderBottom="1px solid" borderColor={border} pb={3}>
          <Text fontFamily={monoFont} fontSize="10px" letterSpacing="0.12em" textTransform="uppercase" color="var(--accent)">
            Visibility
          </Text>
          <HStack spacing={2} mt={1} align="baseline">
            <Text fontSize="18px" fontWeight={600} letterSpacing="-0.01em">
              Hidden items
            </Text>
            <Text fontFamily={monoFont} fontSize="12px" color={dim}>
              {rows.length}
            </Text>
          </HStack>
          <Text fontSize="12px" fontWeight={400} color={dim} mt={1}>
            Left out of the CV, the PDF and the website — or, marked “limited”, shown on some of them only (public pages,
            downloads, private links). Select a row to jump to it.
          </Text>
        </DrawerHeader>
        <DrawerBody px={{ base: 3, md: 5 }} py={4} ref={listRef}>
          {rows.length === 0 ? (
            <Flex direction="column" align="center" textAlign="center" gap={2} py={12} px={4}>
              <Text fontWeight={500}>Nothing is hidden</Text>
              <Text fontSize="13px" color={dim} maxW="340px">
                Use the eye next to any section, entry, field or bullet to keep it off the CV and the website.
              </Text>
            </Flex>
          ) : (
            byLang.map(({ lang, rows: langRows }) =>
              langRows.length ? (
                <Box key={lang} as="section" aria-label={lang === 'en' ? 'English' : 'Chinese'} mb={6}>
                  <Flex align="center" gap={3} mb={2}>
                    <Text fontFamily={monoFont} fontSize="11px" letterSpacing="0.1em" color={dim} flexShrink={0}>
                      [{lang === 'en' ? 'EN' : '中'}] {langRows.length}
                    </Text>
                    <Box flex={1} h="1px" bg={border} />
                  </Flex>
                  {groupBySection(langRows).map((group) => (
                    <Box key={group.sectionIdx} mb={3}>
                      <Text as="h3" fontSize="12px" fontWeight={600} mb={1}>
                        {group.title}
                      </Text>
                      <Flex as="ul" direction="column" gap={1.5} listStyleType="none" m={0} p={0}>
                        {group.rows.map((row) => {
                          flatIndex += 1
                          const myIndex = flatIndex
                          const trail = row.kind === 'section-cv' || row.kind === 'section-web' ? [] : row.crumbs.slice(1)
                          return (
                            <Flex
                              as="li"
                              key={row.id}
                              align="stretch"
                              gap={2}
                              border="1px solid"
                              borderColor={border}
                              borderRadius="md"
                              bg={surfaceAlt}
                              _hover={{ borderColor: borderStrong }}
                              transition="border-color 140ms var(--ease-out-quart)"
                            >
                              <Box
                                as="button"
                                type="button"
                                flex={1}
                                minW={0}
                                textAlign="left"
                                px={3}
                                py={2}
                                borderRadius="md"
                                onClick={() => {
                                  setJumping(true)
                                  onJump(row)
                                }}
                                _focusVisible={{ outline: '2px solid var(--accent)', outlineOffset: '-2px' }}
                                aria-label={`Jump to ${[group.title, ...trail, row.label].join(', ')} (${KIND_LABEL[row.kind]}, ${
                                  lang === 'en' ? 'English' : 'Chinese'
                                })`}
                              >
                                <HStack as="span" spacing={2} minW={0}>
                                  <Text
                                    as="span"
                                    fontFamily={monoFont}
                                    fontSize="9px"
                                    letterSpacing="0.1em"
                                    textTransform="uppercase"
                                    color={row.kind === 'limited' ? 'accent.text' : hiddenFg}
                                    border="1px solid"
                                    borderColor={row.kind === 'limited' ? 'var(--accent)' : hiddenBorder}
                                    borderRadius="3px"
                                    px="4px"
                                    lineHeight="14px"
                                    flexShrink={0}
                                  >
                                    {KIND_LABEL[row.kind]}
                                  </Text>
                                  {trail.length ? (
                                    <Text as="span" fontSize="11px" color={faint} noOfLines={1} minW={0}>
                                      {trail.join(' › ')}
                                    </Text>
                                  ) : null}
                                </HStack>
                                <Text as="span" display="block" fontSize="13px" fontWeight={500} mt={1} noOfLines={1}>
                                  {row.label}
                                </Text>
                                {row.preview ? (
                                  <Text as="span" display="block" fontSize="12px" color={dim} noOfLines={1}>
                                    {row.preview}
                                  </Text>
                                ) : null}
                              </Box>
                              <Flex align="center" pr={2}>
                                <Button
                                  data-show-btn=""
                                  size="xs"
                                  variant="outline"
                                  borderColor={border}
                                  leftIcon={<ViewIcon />}
                                  aria-label={row.kind === 'limited' ? `Show ${row.label} everywhere` : `Show ${row.label}`}
                                  _hover={{ color: 'var(--accent)', borderColor: 'var(--accent)', bg: 'var(--accent-soft)' }}
                                  onClick={() => {
                                    refocusAt.current = myIndex
                                    onShow(row)
                                  }}
                                >
                                  {row.kind === 'limited' ? 'Everywhere' : 'Show'}
                                </Button>
                              </Flex>
                            </Flex>
                          )
                        })}
                      </Flex>
                    </Box>
                  ))}
                </Box>
              ) : null,
            )
          )}
        </DrawerBody>
        <DrawerFooter borderTop="1px solid" borderColor={border} justifyContent="flex-start">
          <Text fontSize="11px" color={dim}>
            {linked
              ? 'Linked: “Show” also applies to the other language where the two line up.'
              : 'Unlinked: “Show” applies to that language only.'}
          </Text>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  )
}
