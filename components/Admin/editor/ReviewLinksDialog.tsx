import { useCallback, useEffect, useId, useRef, useState } from 'react'
import {
  Badge,
  Box,
  Button,
  Flex,
  FormControl,
  FormHelperText,
  FormLabel,
  Input,
  Modal,
  ModalBody,
  ModalCloseButton,
  ModalContent,
  ModalFooter,
  ModalHeader,
  ModalOverlay,
  Select,
  SimpleGrid,
  Skeleton,
  Stack,
  Text,
} from '@chakra-ui/react'
import NextLink from 'next/link'
import { inputProps, MONO, outlineButtonProps, primaryButtonProps, warnTextProps } from '../shell/ui'
import { readJsonObject } from '../shell/http'
import { relativeInstant } from '../shell/itemSchedule'
import { linkStatusLine, parseReviewLink, parseReviewLinks, parseShareable, TTL_DEFAULT_HOURS, TTL_OPTIONS, viewsLine, type ReviewLinkRow, type Shareable } from '../shell/reviewLinks'
import { formatSiteTime } from '../../../lib/schedule/time'

/**
 * "Share for review…" (H5): private links that show this draft — or the
 * saved, unpublished changes of a live item — read-only, exactly as it will
 * look, to anyone who has the link, for one hour to thirty days. Each link
 * says how often it was opened (never by whom) and can be turned off at
 * once. The list on Admin → Scheduled & review links shows every item's.
 */

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    return false
  }
}

const absolute = (path: string) => (typeof window === 'undefined' ? path : `${window.location.origin}${path}`)

type CopyState = 'idle' | 'copied' | 'failed'

/**
 * A polite status message that is announced every time it is set, also when
 * the words repeat: cleared first, set on the next frame (the live region
 * itself stays in the page the whole time).
 */
function useStatusMessage(): [string, (message: string) => void] {
  const [message, setMessage] = useState('')
  const frame = useRef(0)
  useEffect(() => () => cancelAnimationFrame(frame.current), [])
  const say = useCallback((next: string) => {
    setMessage('')
    cancelAnimationFrame(frame.current)
    frame.current = requestAnimationFrame(() => setMessage(next))
  }, [])
  return [message, say]
}

/** One link: its address with Copy, what it shows, its life and views, and Turn off. */
export function ReviewLinkItem({
  link,
  now,
  onRevoke,
  showItem = false,
  autoCopy = null,
}: {
  link: ReviewLinkRow
  now: number
  /** Resolves false when the link could not be turned off. */
  onRevoke: (id: string) => Promise<boolean>
  showItem?: boolean
  /**
   * The dialog copied this new link itself ('copied' / 'failed'). The row
   * shows it on its button once it is in the page; the dialog announces it.
   */
  autoCopy?: Exclude<CopyState, 'idle'> | null
}) {
  const [copied, setCopied] = useState<CopyState>('idle')
  const [said, say] = useStatusMessage()
  const [confirm, setConfirm] = useState(false)
  const [busy, setBusy] = useState(false)
  const rowRef = useRef<HTMLLIElement>(null)
  const refocusRow = useRef(false)
  const active = link.status === 'active' && !!link.path
  // A state change of a row that is already rendered (seeding useState from the prop missed it: the row mounts before the copy settles).
  useEffect(() => {
    if (autoCopy) setCopied(autoCopy)
  }, [autoCopy])
  useEffect(() => {
    if (copied !== 'copied') return
    const t = setTimeout(() => setCopied('idle'), 2500)
    return () => clearTimeout(t)
  }, [copied])
  // Turned off: its buttons are gone, so focus stays on the row (it says "off"), never on <body>.
  useEffect(() => {
    if (active || !refocusRow.current) return
    refocusRow.current = false
    rowRef.current?.focus()
    say('Review link turned off')
  }, [active, say])

  return (
    <Box
      as="li"
      ref={rowRef}
      tabIndex={-1}
      listStyleType="none"
      py={3}
      borderTop="1px solid"
      borderColor="page.border"
      data-testid="review-link"
      data-status={link.status}
    >
      <Flex align="flex-start" justify="space-between" gap={3} wrap="wrap">
        <Box minW={0} flex="1 1 240px">
          <Flex align="center" gap={2} wrap="wrap">
            {showItem ? (
              <Text as={NextLink} href={`/admin/${link.collection}/edit?slug=${encodeURIComponent(link.currentSlug)}`} fontSize="sm" fontWeight={500} className="link-underline">
                {link.title}
              </Text>
            ) : (
              <Text fontSize="sm" fontWeight={500}>
                {link.label || (link.variant === 'draft' ? 'Draft' : 'Unpublished changes')}
              </Text>
            )}
            <Badge variant="subtle" colorScheme={active ? 'purple' : 'gray'} fontSize="9px">
              {active ? (link.variant === 'draft' ? 'draft' : 'changes') : link.status === 'revoked' ? 'off' : 'expired'}
            </Badge>
          </Flex>
          {showItem && link.label ? (
            <Text fontSize="xs" color="page.fg-secondary">
              {link.label}
            </Text>
          ) : null}
          <Text fontSize="xs" color="page.fg-secondary" className="tnum" title={formatSiteTime(link.expiresAt)}>
            {linkStatusLine(link, now, relativeInstant)} · {viewsLine(link, now, relativeInstant)}
          </Text>
          {active ? (
            <Text fontFamily={MONO} fontSize="11px" color="page.fg-secondary" mt={1} noOfLines={1} wordBreak="break-all" data-testid="review-link-url">
              {absolute(link.path as string)}
            </Text>
          ) : null}
        </Box>
        {active ? (
          <Flex gap={2} flexShrink={0}>
            <Button
              size="xs"
              minH="28px"
              {...outlineButtonProps}
              onClick={async () => {
                const ok = await copyText(absolute(link.path as string))
                setCopied(ok ? 'copied' : 'failed')
                say(ok ? 'Link copied' : 'Could not copy the link')
              }}
              aria-label={`Copy the review link${link.label ? ` (${link.label})` : ''}`}
            >
              {copied === 'copied' ? 'Copied' : copied === 'failed' ? 'Copy failed' : 'Copy link'}
            </Button>
            <Button
              size="xs"
              minH="28px"
              variant={confirm ? 'solid' : 'ghost'}
              colorScheme={confirm ? 'red' : undefined}
              color={confirm ? undefined : 'page.fg-secondary'}
              isLoading={busy}
              onBlur={() => setConfirm(false)}
              aria-label={confirm ? 'Confirm: turn this review link off' : `Turn off the review link${link.label ? ` (${link.label})` : ''}`}
              onClick={async () => {
                if (!confirm) {
                  setConfirm(true)
                  return
                }
                setBusy(true)
                refocusRow.current = true
                let ok = false
                try {
                  ok = await onRevoke(link.id)
                } finally {
                  if (!ok) refocusRow.current = false
                  setBusy(false)
                  setConfirm(false)
                }
              }}
            >
              {confirm ? 'Confirm — turn off' : 'Turn off'}
            </Button>
          </Flex>
        ) : null}
      </Flex>
      <Box as="span" role="status" aria-live="polite" className="sr-only">
        {said}
      </Box>
    </Box>
  )
}

type Props = {
  isOpen: boolean
  onClose: () => void
  collection: 'blog' | 'work'
  slug: string
  noun: string
  /** The editor has unsaved edits (a link shows the saved version). */
  dirty: boolean
}

export default function ReviewLinksDialog({ isOpen, onClose, collection, slug, noun, dirty }: Props) {
  const ids = useId()
  const firstRef = useRef<HTMLSelectElement>(null)
  const [links, setLinks] = useState<ReviewLinkRow[] | null>(null)
  const [shareable, setShareable] = useState<Shareable | null>(null)
  const [loadError, setLoadError] = useState('')
  const [ttl, setTtl] = useState(TTL_DEFAULT_HOURS)
  const [label, setLabel] = useState('')
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState('')
  // The link just made and whether it reached the clipboard.
  const [fresh, setFresh] = useState<{ id: string; copy: Exclude<CopyState, 'idle'> } | null>(null)
  const [notice, announce] = useStatusMessage()
  const [now, setNow] = useState(() => Date.now())

  const load = useCallback(async () => {
    setLoadError('')
    try {
      const res = await fetch(`/api/admin/review-links?collection=${collection}&slug=${encodeURIComponent(slug)}`, { cache: 'no-store' })
      const data = await readJsonObject(res)
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`)
      setLinks(parseReviewLinks(data.links))
      setShareable(parseShareable(data.shareable))
      setNow(Date.now())
    } catch (e) {
      setLoadError(e instanceof Error && e.message !== 'Failed to fetch' ? e.message : 'network error')
    }
  }, [collection, slug])

  useEffect(() => {
    if (!isOpen) return
    setLinks(null)
    setShareable(null)
    setError('')
    setLabel('')
    setTtl(TTL_DEFAULT_HOURS)
    setFresh(null)
    void load()
    const t = setInterval(() => setNow(Date.now()), 30_000)
    return () => clearInterval(t)
  }, [isOpen, load])

  const create = async () => {
    setCreating(true)
    setError('')
    try {
      const res = await fetch('/api/admin/review-links', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ collection, slug, ttlHours: ttl, label }),
      })
      const data = await readJsonObject(res)
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`)
      const link = parseReviewLink(data.link)
      if (link) {
        setLinks((l) => [link, ...(l || [])])
        // Copied straight away: sharing is what the owner came for. The new
        // row's button says so; the dialog's status line announces it.
        const ok = !!link.path && (await copyText(absolute(link.path)))
        setFresh({ id: link.id, copy: ok ? 'copied' : 'failed' })
        announce(ok ? 'Review link created and copied to the clipboard.' : 'Review link created — copy it from the list below.')
      }
      setLabel('')
      setNow(Date.now())
    } catch (e) {
      setError(e instanceof Error && e.message !== 'Failed to fetch' ? e.message : 'Network error — no link was made.')
    } finally {
      setCreating(false)
    }
  }

  const revoke = async (id: string) => {
    try {
      const res = await fetch('/api/admin/review-links', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }) })
      const data = await readJsonObject(res)
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`)
      const updated = parseReviewLink(data.link)
      setLinks((l) => (l || []).map((x) => (x.id === id ? (updated ?? { ...x, status: 'revoked', revokedAt: Date.now(), path: null }) : x)))
      return true
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      return false
    }
  }

  const active = (links || []).filter((l) => l.status === 'active')
  const ended = (links || []).filter((l) => l.status !== 'active')
  const canShare = shareable?.variant != null

  return (
    <Modal isOpen={isOpen} onClose={onClose} initialFocusRef={firstRef} size="lg" isCentered scrollBehavior="inside">
      <ModalOverlay />
      <ModalContent bg="page.bg-elevated" border="1px solid" borderColor="page.border" mx={4} data-testid="review-links-dialog">
        <ModalHeader fontSize="md" pb={1} pr={12}>
          Share for review
        </ModalHeader>
        <ModalCloseButton />
        <ModalBody>
          <Stack spacing={4}>
            <Text fontSize="sm" color="page.fg-secondary">
              Anyone with the link can read {shareable?.variant === 'changes' ? `the unpublished changes to this ${noun}` : `this ${noun}`} — exactly as it will look,
              marked “Preview” — until the link expires. It is never indexed or cached, and you can turn it off at any time.
            </Text>
            {loadError ? (
              <Text fontSize="sm" color="status.error" role="alert">
                Couldn’t load the links ({loadError}).{' '}
                <Button size="xs" variant="link" color="accent.text" onClick={() => void load()}>
                  Retry
                </Button>
              </Text>
            ) : !shareable ? (
              <Skeleton h="72px" />
            ) : canShare ? (
              <Box as="form" onSubmit={(e: React.FormEvent) => (e.preventDefault(), void create())}>
                <SimpleGrid columns={{ base: 1, sm: 2 }} spacing={3}>
                  <FormControl>
                    <FormLabel fontSize="13px" htmlFor={`${ids}-ttl`}>
                      Expires after
                    </FormLabel>
                    <Select {...inputProps} size="sm" ref={firstRef} id={`${ids}-ttl`} value={ttl} onChange={(e) => setTtl(Number(e.target.value))}>
                      {TTL_OPTIONS.map((o) => (
                        <option key={o.hours} value={o.hours}>
                          {o.label}
                        </option>
                      ))}
                    </Select>
                  </FormControl>
                  <FormControl>
                    <FormLabel fontSize="13px" htmlFor={`${ids}-label`}>
                      Note (only you see it)
                    </FormLabel>
                    <Input {...inputProps} size="sm" id={`${ids}-label`} value={label} maxLength={80} onChange={(e) => setLabel(e.target.value)} placeholder="Who it is for" autoComplete="off" />
                  </FormControl>
                </SimpleGrid>
                <FormControl mt={1}>
                  <FormHelperText fontSize="xs" color="page.fg-secondary">
                    Shows the last saved version{shareable.variant === 'changes' ? ' of the changes' : ''}; edits you save later appear in it too.
                  </FormHelperText>
                </FormControl>
                {dirty ? (
                  <Text fontSize="xs" mt={2} {...warnTextProps}>
                    You have unsaved edits — save them (⌘S) to include them.
                  </Text>
                ) : null}
                <Button type="submit" size="sm" mt={3} {...primaryButtonProps} isLoading={creating} loadingText="Creating">
                  Create &amp; copy link
                </Button>
              </Box>
            ) : (
              <Text fontSize="sm" {...warnTextProps} data-testid="review-nothing-to-share">
                {shareable.reason === 'live'
                  ? `This ${noun} is live and has no saved changes — share its public page instead. Save changes first to share them for review.`
                  : `Save this ${noun} first.`}
              </Text>
            )}
            {error ? (
              <Text fontSize="sm" color="status.error" role="alert">
                {error}
              </Text>
            ) : null}

            {links === null && !loadError ? (
              <Skeleton h="48px" />
            ) : active.length || ended.length ? (
              <Box>
                <Text fontSize="13px" fontWeight={600}>
                  {active.length ? `Active links (${active.length})` : 'No active links'}
                </Text>
                <Box as="ul" mt={1}>
                  {[...active, ...ended].map((l) => (
                    <ReviewLinkItem key={l.id} link={l} now={now} onRevoke={revoke} autoCopy={fresh?.id === l.id ? fresh.copy : null} />
                  ))}
                </Box>
              </Box>
            ) : null}
          </Stack>
          {/* In the page while the dialog is open, so what Create & copy did is announced. */}
          <Box role="status" aria-live="polite" className="sr-only" data-testid="review-links-status">
            {notice}
          </Box>
        </ModalBody>
        <ModalFooter gap={2}>
          <Button size="sm" {...outlineButtonProps} onClick={onClose}>
            Done
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  )
}
