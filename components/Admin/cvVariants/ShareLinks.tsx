import React, { useEffect, useId, useRef, useState } from 'react'
import {
  Box,
  Button,
  ButtonGroup,
  Flex,
  FormControl,
  FormHelperText,
  FormLabel,
  HStack,
  Input,
  InputGroup,
  InputRightElement,
  Menu,
  MenuButton,
  MenuItem,
  MenuList,
  Select,
  Text,
  Tooltip,
  useToast,
} from '@chakra-ui/react'
import { CheckIcon, CopyIcon, ExternalLinkIcon } from '@chakra-ui/icons'
import { FiLock } from 'react-icons/fi'
import { useStepUp } from '../security/useStepUp'
import { wasStepUpCancelled } from '../security/stepUpClient'
import { readJsonObject } from '../shell/http'
import { MONO, inputProps, outlineButtonProps, primaryButtonProps } from '../shell/ui'
import { DEFAULT_EXPIRY_DAYS, EXPIRY_DAYS, NOTE_MAX, relativeDays, type ShareLink } from '../../../lib/cvShare/links'
import type { CvLang } from '../../../lib/cvVisibility'
import { LINKS_URL } from './api'

/**
 * Private links of one saved variant (E4): make one (the full address is
 * shown ONCE — only its hash is kept — with Copy and Open), and list every
 * link with its note, language, state, expiry and opens (a count and the
 * day of the last one; nothing about who opened it). Revoke ends a link at
 * once; Extend moves its expiry; an ended link can be removed from the list.
 * Making or extending a link asks for a recent sign-in.
 */

const STATE_STYLE: Record<ShareLink['state'], { label: string; color: string; border: string }> = {
  active: { label: 'Active', color: 'green.700', border: 'green.500' },
  expired: { label: 'Expired', color: 'page.fg-secondary', border: 'page.border-strong' },
  revoked: { label: 'Revoked', color: 'red.600', border: 'red.400' },
}

function StateChip({ state }: { state: ShareLink['state'] }) {
  const s = STATE_STYLE[state]
  return (
    <Text
      as="span"
      fontFamily={MONO}
      fontSize="9px"
      letterSpacing="0.08em"
      textTransform="uppercase"
      color={s.color}
      _dark={state === 'active' ? { color: 'green.300' } : state === 'revoked' ? { color: 'red.300' } : undefined}
      border="1px solid"
      borderColor={s.border}
      borderRadius="3px"
      px="5px"
      lineHeight="16px"
      flexShrink={0}
    >
      {s.label}
    </Text>
  )
}

function opensLine(link: ShareLink): string {
  if (!link.openCount) return 'Not opened yet'
  const times = link.openCount === 1 ? 'Opened once' : `Opened ${link.openCount} times`
  return link.lastOpenedDay ? `${times} · last ${link.lastOpenedDay}` : times
}

function expiryLine(link: ShareLink, now: number): string {
  if (link.state === 'revoked') return 'Revoked'
  return link.state === 'expired' ? `Expired ${relativeDays(link.expiresAt, now)}` : `Expires ${relativeDays(link.expiresAt, now)}`
}

function NewLinkCard({ url, onDone }: { url: string; onDone: () => void }) {
  const [copied, setCopied] = useState(false)
  const inputRef = useRef<HTMLInputElement | null>(null)
  const id = useId()
  useEffect(() => {
    inputRef.current?.focus()
    inputRef.current?.select()
  }, [url])
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2000)
    } catch {
      inputRef.current?.select()
    }
  }
  return (
    <Box role="region" aria-labelledby={`${id}-title`} border="1px solid" borderColor="var(--accent)" bg="var(--accent-soft)" borderRadius="lg" p={3} mb={3}>
      <Text id={`${id}-title`} fontSize="13px" fontWeight={600}>
        Your new private link
      </Text>
      <Text fontSize="12px" color="page.fg-secondary" mt={0.5} mb={2}>
        This is the only time the full address is shown — copy it now. You can always make another.
      </Text>
      <InputGroup size="sm">
        <Input ref={inputRef} {...inputProps} value={url} isReadOnly fontFamily={MONO} fontSize="12px" pr="72px" aria-label="Private link" onFocus={(e) => e.target.select()} bg="page.bg" />
        <InputRightElement w="72px">
          <Button size="xs" onClick={copy} leftIcon={copied ? <CheckIcon /> : <CopyIcon />} aria-live="polite">
            {copied ? 'Copied' : 'Copy'}
          </Button>
        </InputRightElement>
      </InputGroup>
      <HStack mt={2} spacing={2}>
        <Button as="a" href={url} target="_blank" rel="noopener noreferrer" size="xs" {...outlineButtonProps} rightIcon={<ExternalLinkIcon />}>
          Open as a visitor
        </Button>
        <Button size="xs" variant="ghost" onClick={onDone}>
          Done
        </Button>
      </HStack>
    </Box>
  )
}

function LinkRow({ link, now, onChanged }: { link: ShareLink; now: number; onChanged: () => void }) {
  const toast = useToast()
  const { fetchWithStepUp, stepUpElement } = useStepUp()
  const [busy, setBusy] = useState(false)
  const [confirmRevoke, setConfirmRevoke] = useState(false)
  const [editing, setEditing] = useState(false)
  const [note, setNote] = useState(link.note)
  const noteId = useId()

  const send = async (method: 'PATCH' | 'DELETE', body: Record<string, unknown>, stepUp = false) => {
    setBusy(true)
    try {
      const init: RequestInit = { method, credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: link.id, ...body }) }
      const res = stepUp ? await fetchWithStepUp(LINKS_URL, init, 'A private link shows whatever its variant shares privately.') : await fetch(LINKS_URL, init)
      if (wasStepUpCancelled(res)) return false
      const b = await readJsonObject(res)
      if (!res.ok) {
        toast({ status: 'error', title: 'Not changed', description: b.error || `Server responded ${res.status}`, position: 'bottom-right', isClosable: true })
        return false
      }
      onChanged()
      return true
    } catch {
      toast({ status: 'error', title: 'Not changed', description: 'Network error.', position: 'bottom-right', isClosable: true })
      return false
    } finally {
      setBusy(false)
    }
  }

  const label = link.note || 'Link without a note'
  return (
    <Box as="li" border="1px solid" borderColor="page.border" borderRadius="lg" px={3} py={2.5} bg={link.state === 'active' ? 'page.bg' : 'transparent'}>
      <Flex align="flex-start" justify="space-between" gap={3} flexWrap="wrap">
        <Box minW={0} flex="1 1 220px">
          <HStack spacing={2} minW={0}>
            <StateChip state={link.state} />
            <Text as="span" fontFamily={MONO} fontSize="10px" color="page.fg-secondary" flexShrink={0}>
              {link.lang === 'zh' ? '中文' : 'EN'}
            </Text>
            {editing ? null : (
              <Text fontSize="13px" fontWeight={500} noOfLines={1} color={link.note ? 'page.fg' : 'page.fg-secondary'} fontStyle={link.note ? undefined : 'italic'}>
                {label}
              </Text>
            )}
          </HStack>
          {editing ? (
            <HStack mt={2} spacing={2} as="form" onSubmit={async (e: React.FormEvent) => {
              e.preventDefault()
              if (await send('PATCH', { action: 'note', note })) setEditing(false)
            }}>
              <Input id={noteId} {...inputProps} size="sm" value={note} maxLength={NOTE_MAX} onChange={(e) => setNote(e.target.value)} aria-label="Note (only you see it)" autoFocus />
              <Button size="sm" type="submit" isLoading={busy}>
                Save
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  setNote(link.note)
                  setEditing(false)
                }}
              >
                Cancel
              </Button>
            </HStack>
          ) : null}
          <Text fontSize="12px" color="page.fg-secondary" mt={1}>
            {opensLine(link)} · {expiryLine(link, now)} · made {new Date(link.createdAt).toISOString().slice(0, 10)}
          </Text>
        </Box>
        <HStack spacing={1} flexShrink={0}>
          {link.state === 'active' ? (
            confirmRevoke ? (
              <HStack spacing={1} role="group" aria-label="Confirm revoking">
                <Text fontSize="12px" color="page.fg-secondary" mr={1}>
                  Stop it working now?
                </Text>
                <Button size="xs" colorScheme="red" isLoading={busy} onClick={async () => (await send('PATCH', { action: 'revoke' })) && setConfirmRevoke(false)} autoFocus>
                  Revoke
                </Button>
                <Button size="xs" variant="ghost" onClick={() => setConfirmRevoke(false)}>
                  Keep
                </Button>
              </HStack>
            ) : (
              <>
                <Button size="xs" variant="ghost" onClick={() => setEditing(true)} isDisabled={editing} aria-label={`Edit the note of ${label}`}>
                  Note
                </Button>
                <Menu isLazy placement="bottom-end">
                  <MenuButton as={Button} size="xs" variant="ghost" isDisabled={busy} aria-label={`Extend ${label}`}>
                    Extend
                  </MenuButton>
                  <MenuList fontSize="13px" zIndex={40}>
                    {EXPIRY_DAYS.map((d) => (
                      <MenuItem key={d} onClick={() => void send('PATCH', { action: 'extend', days: d }, true)}>
                        {d} days from today
                      </MenuItem>
                    ))}
                  </MenuList>
                </Menu>
                <Button size="xs" variant="outline" colorScheme="red" onClick={() => setConfirmRevoke(true)} aria-label={`Revoke ${label}`}>
                  Revoke
                </Button>
              </>
            )
          ) : link.state === 'expired' ? (
            <>
              <Menu isLazy placement="bottom-end">
                <MenuButton as={Button} size="xs" variant="ghost" isDisabled={busy} aria-label={`Bring back ${label}`}>
                  Bring back
                </MenuButton>
                <MenuList fontSize="13px" zIndex={40}>
                  {EXPIRY_DAYS.map((d) => (
                    <MenuItem key={d} onClick={() => void send('PATCH', { action: 'extend', days: d }, true)}>
                      For {d} days
                    </MenuItem>
                  ))}
                </MenuList>
              </Menu>
              <Button size="xs" variant="ghost" isLoading={busy} onClick={() => void send('DELETE', {})} aria-label={`Remove ${label} from the list`}>
                Remove
              </Button>
            </>
          ) : (
            <Button size="xs" variant="ghost" isLoading={busy} onClick={() => void send('DELETE', {})} aria-label={`Remove ${label} from the list`}>
              Remove
            </Button>
          )}
        </HStack>
      </Flex>
      {stepUpElement}
    </Box>
  )
}

export default function ShareLinks({
  variantId,
  variantName,
  saved,
  keyConfigured,
  links,
  languages,
  onChanged,
}: {
  variantId: string
  variantName: string
  /** The variant is saved as shown (a link opens the saved version). */
  saved: boolean
  keyConfigured: boolean
  links: ShareLink[]
  /** Languages the variant prints something in (null while unknown). */
  languages: Record<CvLang, boolean> | null
  onChanged: () => void
}) {
  const toast = useToast()
  const { fetchWithStepUp, stepUpElement } = useStepUp()
  const formId = useId()
  const [note, setNote] = useState('')
  const [lang, setLang] = useState<CvLang>('en')
  const [days, setDays] = useState(DEFAULT_EXPIRY_DAYS)
  const [creating, setCreating] = useState(false)
  const [fresh, setFresh] = useState<string | null>(null)
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => setNow(Date.now()), [links])
  useEffect(() => setFresh(null), [variantId])
  useEffect(() => {
    if (languages && !languages[lang]) setLang(languages.en ? 'en' : 'zh')
  }, [languages, lang])

  const mine = links.filter((l) => l.variantId === variantId)
  const active = mine.filter((l) => l.state === 'active').length
  const blocked = !keyConfigured ? 'Private links need JWT_SECRET on the server.' : !saved ? 'Save the variant first — a link opens the saved version.' : ''

  const create = async (e: React.FormEvent) => {
    e.preventDefault()
    if (blocked) return
    setCreating(true)
    try {
      const res = await fetchWithStepUp(
        LINKS_URL,
        { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ variantId, lang, days, note }) },
        'A private link shows whatever this variant shares privately.',
      )
      if (wasStepUpCancelled(res)) return
      const b = await readJsonObject(res)
      if (!res.ok || typeof b.path !== 'string') {
        toast({ status: 'error', title: 'No link made', description: b.error || `Server responded ${res.status}`, position: 'bottom-right', isClosable: true })
        return
      }
      setFresh(`${window.location.origin}${b.path}`)
      setNote('')
      onChanged()
    } catch {
      toast({ status: 'error', title: 'No link made', description: 'Network error.', position: 'bottom-right', isClosable: true })
    } finally {
      setCreating(false)
    }
  }

  return (
    <Box as="section" aria-labelledby={`${formId}-title`} mt={8} pt={6} borderTop="1px solid" borderColor="page.border">
      <Flex align="baseline" justify="space-between" gap={2} flexWrap="wrap" mb={1}>
        <HStack spacing={2}>
          <Box as="span" color="page.fg-secondary" aria-hidden>
            <FiLock />
          </Box>
          <Text as="h3" id={`${formId}-title`} fontSize="15px" fontWeight={600}>
            Private links
          </Text>
        </HStack>
        <Text fontFamily={MONO} fontSize="10px" color="page.fg-secondary">
          {active} active · {mine.length} total
        </Text>
      </Flex>
      <Text fontSize="12px" color="page.fg-secondary" mb={4} maxW="64ch">
        Share “{variantName}” with one reader. A link expires, can be revoked at any time, is never indexed and shows only
        what this variant prints for private links. You see how often it was opened and on which day last — nothing about who.
      </Text>

      {fresh ? <NewLinkCard url={fresh} onDone={() => setFresh(null)} /> : null}

      <Box as="form" onSubmit={create} border="1px dashed" borderColor="page.border-strong" borderRadius="lg" p={3} mb={4} aria-describedby={blocked ? `${formId}-blocked` : undefined}>
        <Flex gap={3} flexWrap="wrap" align="flex-end">
          <FormControl flex="1 1 240px" minW={0}>
            <FormLabel fontSize="12px" mb={1}>
              Note <Text as="span" color="page.fg-secondary">(only you see it)</Text>
            </FormLabel>
            <Input {...inputProps} size="sm" value={note} maxLength={NOTE_MAX} placeholder="Who it is for — e.g. Example Corp, ML Engineer" onChange={(e) => setNote(e.target.value)} />
          </FormControl>
          <FormControl w="auto">
            <FormLabel fontSize="12px" mb={1} id={`${formId}-lang`}>
              Opens in
            </FormLabel>
            <ButtonGroup size="sm" isAttached variant="outline" role="group" aria-labelledby={`${formId}-lang`}>
              {(['en', 'zh'] as CvLang[]).map((l) => (
                <Tooltip key={l} label={languages && !languages[l] ? `This variant prints nothing in ${l === 'en' ? 'English' : 'Chinese'}` : ''} isDisabled={!languages || languages[l]} hasArrow>
                  <Button
                    onClick={() => setLang(l)}
                    aria-pressed={lang === l}
                    isDisabled={!!languages && !languages[l]}
                    borderColor={lang === l ? 'var(--accent)' : 'page.border-strong'}
                    bg={lang === l ? 'var(--accent-soft)' : undefined}
                    color={lang === l ? 'accent.text' : undefined}
                    fontFamily={MONO}
                    fontSize="12px"
                    zIndex={lang === l ? 1 : undefined}
                  >
                    {l === 'en' ? 'EN' : '中文'}
                  </Button>
                </Tooltip>
              ))}
            </ButtonGroup>
          </FormControl>
          <FormControl w="auto">
            <FormLabel fontSize="12px" mb={1}>
              Expires after
            </FormLabel>
            <Select {...inputProps} size="sm" value={days} onChange={(e) => setDays(Number(e.target.value))} w="130px">
              {EXPIRY_DAYS.map((d) => (
                <option key={d} value={d}>
                  {d} days
                </option>
              ))}
            </Select>
          </FormControl>
          <Button type="submit" size="sm" {...primaryButtonProps} isLoading={creating} loadingText="Making" isDisabled={!!blocked}>
            Make link
          </Button>
        </Flex>
        {blocked ? (
          <FormControl>
            <FormHelperText id={`${formId}-blocked`} fontSize="12px" color="orange.700" _dark={{ color: 'orange.300' }} mt={2}>
              {blocked}
            </FormHelperText>
          </FormControl>
        ) : null}
      </Box>

      {mine.length ? (
        <Flex as="ul" direction="column" gap={2} listStyleType="none" m={0} p={0} aria-label={`Private links of ${variantName}`}>
          {mine.map((l) => (
            <LinkRow key={l.id} link={l} now={now} onChanged={onChanged} />
          ))}
        </Flex>
      ) : (
        <Text fontSize="13px" color="page.fg-secondary">
          No links yet.
        </Text>
      )}
      {stepUpElement}
    </Box>
  )
}
