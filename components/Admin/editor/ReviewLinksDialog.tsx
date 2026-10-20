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

/** One link: its address with Copy, what it shows, its life and views, and Turn off. */
export function ReviewLinkItem({
  link,
  now,
  onRevoke,
  showItem = false,
  autoCopied = false,
}: {
  link: ReviewLinkRow
  now: number
  onRevoke: (id: string) => Promise<void>
  showItem?: boolean
  autoCopied?: boolean
}) {
  const [copied, setCopied] = useState<'idle' | 'copied' | 'failed'>(autoCopied ? 'copied' : 'idle')
  const [confirm, setConfirm] = useState(false)
  const [busy, setBusy] = useState(false)
  const active = link.status === 'active' && !!link.path
  useEffect(() => {
    if (copied !== 'copied') return
    const t = setTimeout(() => setCopied('idle'), 2500)
    return () => clearTimeout(t)
  }, [copied])

  return (
    <Box as="li" listStyleType="none" py={3} borderTop="1px solid" borderColor="page.border" data-testid="review-link" data-status={link.status}>
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
              onClick={async () => setCopied((await copyText(absolute(link.path as string))) ? 'copied' : 'failed')}
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
                await onRevoke(link.id)
                setBusy(false)
                setConfirm(false)
              }}
            >
              {confirm ? 'Confirm — turn off' : 'Turn off'}
            </Button>
          </Flex>
        ) : null}
      </Flex>
      <Box as="span" role="status" aria-live="polite" className="sr-only">
        {copied === 'copied' ? 'Link copied' : copied === 'failed' ? 'Could not copy the link' : ''}
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
  const [fresh, setFresh] = useState<string | null>(null)
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
        // Copied straight away: sharing is what the owner came for.
        if (link.path && (await copyText(absolute(link.path)))) setFresh(link.id)
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
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
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
                    <ReviewLinkItem key={l.id} link={l} now={now} onRevoke={revoke} autoCopied={fresh === l.id} />
                  ))}
                </Box>
              </Box>
            ) : null}
          </Stack>
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
