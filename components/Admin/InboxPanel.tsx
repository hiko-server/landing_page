import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Alert,
  AlertDescription,
  AlertDialog,
  AlertDialogBody,
  AlertDialogContent,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogOverlay,
  AlertIcon,
  Badge,
  Box,
  Button,
  Flex,
  Grid,
  HStack,
  Skeleton,
  Stack,
  Text,
  Tooltip,
  useClipboard,
  useDisclosure,
  useToast,
  VisuallyHidden,
} from '@chakra-ui/react'
import { FaInbox, FaRedo, FaReply, FaTrashAlt, FaEnvelopeOpen, FaEnvelope, FaCopy, FaArrowLeft } from 'react-icons/fa'
import { Eyebrow, MONO, Panel, SessionExpiredNotice, outlineButtonProps, primaryButtonProps } from './shell/ui'
import { readJsonObject } from './shell/http'
import { formatWhen, relative, replyHref } from './shell/inboxFormat'

/**
 * Admin Inbox — every message sent through the public contact form
 * (GET/POST /api/admin/inbox). Messages are stored even when email delivery
 * is not configured, so nothing a visitor sends is ever lost.
 */

export type InboxMessage = {
  id: string
  at: string
  name: string
  email: string
  subject: string
  message: string
  delivered: boolean | null
  read: boolean
}

type LoadState = 'loading' | 'ready' | 'error' | 'session'

const RETURN_PATH = '/admin/dashboard?tab=inbox'
const REFRESH_MS = 60_000

export default function InboxPanel({ onUnreadChange }: { onUnreadChange?: (unread: number) => void }) {
  const toast = useToast()
  const [state, setState] = useState<LoadState>('loading')
  const [error, setError] = useState('')
  const [messages, setMessages] = useState<InboxMessage[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [now, setNow] = useState(() => Date.now())
  const del = useDisclosure()
  const cancelRef = useRef<HTMLButtonElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  const selected = useMemo(() => messages.find((m) => m.id === selectedId) || null, [messages, selectedId])
  const unread = useMemo(() => messages.filter((m) => !m.read).length, [messages])
  const undelivered = useMemo(() => messages.filter((m) => m.delivered === false).length, [messages])
  const { onCopy, hasCopied, setValue } = useClipboard('')
  useEffect(() => setValue(selected?.email || ''), [selected, setValue])

  useEffect(() => {
    onUnreadChange?.(unread)
  }, [unread, onUnreadChange])

  const load = useCallback(async (quiet = false) => {
    if (!quiet) setState((s) => (s === 'ready' ? s : 'loading'))
    try {
      const res = await fetch('/api/admin/inbox', { cache: 'no-store', credentials: 'same-origin' })
      if (res.status === 401 || res.status === 403) {
        setState('session')
        return
      }
      const body = await readJsonObject(res)
      if (!res.ok || !Array.isArray(body.messages)) throw new Error(body.error || `HTTP ${res.status}`)
      setMessages(body.messages as InboxMessage[])
      setNow(Date.now())
      setState('ready')
    } catch (e: any) {
      if (quiet) return
      setError(e?.message === 'Failed to fetch' ? 'network error' : e?.message || 'failed to load')
      setState('error')
    }
  }, [])

  useEffect(() => {
    load()
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') load(true)
    }, REFRESH_MS)
    return () => window.clearInterval(timer)
  }, [load])

  const act = useCallback(
    async (action: 'read' | 'unread' | 'delete', ids: string[]) => {
      if (!ids.length) return false
      setBusy(true)
      try {
        const res = await fetch('/api/admin/inbox', {
          method: 'POST',
          credentials: 'same-origin',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action, ids }),
        })
        if (res.status === 401 || res.status === 403) {
          setState('session')
          return false
        }
        const body = await readJsonObject(res)
        if (!res.ok) throw new Error(body.error || `HTTP ${res.status}`)
        setMessages((list) =>
          action === 'delete'
            ? list.filter((m) => !ids.includes(m.id))
            : list.map((m) => (ids.includes(m.id) ? { ...m, read: action === 'read' } : m)),
        )
        return true
      } catch (e: any) {
        toast({ status: 'error', title: 'Inbox update failed', description: e?.message || 'Network error', position: 'bottom-right' })
        return false
      } finally {
        setBusy(false)
      }
    },
    [toast],
  )

  const open = useCallback(
    (m: InboxMessage) => {
      setSelectedId(m.id)
      if (!m.read) act('read', [m.id])
    },
    [act],
  )

  const confirmDelete = async () => {
    if (!selected) return
    const idx = messages.findIndex((m) => m.id === selected.id)
    const ok = await act('delete', [selected.id])
    del.onClose()
    if (ok) {
      const next = messages[idx + 1] || messages[idx - 1] || null
      setSelectedId(next && next.id !== selected.id ? next.id : null)
      toast({ status: 'success', title: 'Message deleted', position: 'bottom-right', duration: 2500 })
    }
  }

  // ↑/↓ move through the list while it has focus.
  const onListKeyDown = (e: React.KeyboardEvent) => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return
    e.preventDefault()
    if (!messages.length) return
    const idx = Math.max(0, messages.findIndex((m) => m.id === selectedId))
    const next = messages[Math.min(messages.length - 1, Math.max(0, idx + (e.key === 'ArrowDown' ? 1 : -1)))]
    open(next)
    requestAnimationFrame(() => listRef.current?.querySelector<HTMLElement>(`[data-id="${next.id}"]`)?.focus())
  }

  if (state === 'session') return <SessionExpiredNotice returnPath={RETURN_PATH} />

  return (
    <Stack spacing={4}>
      <Flex align="center" justify="space-between" gap={3} wrap="wrap">
        <Box>
          <Eyebrow accent>[inbox]</Eyebrow>
          <Text fontSize="lg" fontWeight={600} mt={1}>
            Messages
            {state === 'ready' ? (
              <Text as="span" ml={2} fontFamily={MONO} fontSize="12px" color="page.fg-secondary" fontWeight={400}>
                {messages.length} total · {unread} unread
              </Text>
            ) : null}
          </Text>
        </Box>
        <Button size="sm" leftIcon={<FaRedo />} {...outlineButtonProps} onClick={() => load()} isLoading={state === 'loading'}>
          Refresh
        </Button>
      </Flex>

      {undelivered > 0 ? (
        <Alert status="info" variant="left-accent" borderRadius="md" bg="page.bg-elevated" fontSize="sm">
          <AlertIcon />
          <AlertDescription>
            {undelivered === 1 ? 'One message was' : `${undelivered} messages were`} not emailed to you because email
            delivery (SMTP) is not configured or failed. They are safe here — reply from this page.
          </AlertDescription>
        </Alert>
      ) : null}

      {state === 'error' ? (
        <Alert status="error" variant="left-accent" borderRadius="md" bg="page.bg-elevated" gap={3} flexWrap="wrap">
          <AlertIcon />
          <AlertDescription flex={1} fontSize="sm">
            Couldn’t load the inbox ({error}).
          </AlertDescription>
          <Button size="sm" {...outlineButtonProps} onClick={() => load()}>
            Retry
          </Button>
        </Alert>
      ) : null}

      {state === 'loading' ? (
        <Stack spacing={2}>
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} h="68px" borderRadius="lg" startColor="page.bg-elevated" endColor="page.bg-overlay" />
          ))}
        </Stack>
      ) : null}

      {state === 'ready' && messages.length === 0 ? (
        <Panel textAlign="center" py={14}>
          <Box as={FaInbox} mx="auto" boxSize="28px" color="page.fg-secondary" aria-hidden />
          <Text mt={4} fontWeight={600}>
            No messages yet
          </Text>
          <Text mt={1} fontSize="sm" color="page.fg-secondary" maxW="420px" mx="auto">
            Everything sent through the contact form lands here — even when email delivery isn’t configured.
          </Text>
        </Panel>
      ) : null}

      {state === 'ready' && messages.length > 0 ? (
        <Grid templateColumns={{ base: '1fr', md: 'minmax(260px, 340px) 1fr' }} gap={4} alignItems="start">
          {/* List — on phones it gives way to the open message. */}
          <Box
            ref={listRef}
            role="list"
            aria-label="Messages"
            onKeyDown={onListKeyDown}
            display={{ base: selected ? 'none' : 'block', md: 'block' }}
            border="1px solid"
            borderColor="page.border"
            borderRadius="xl"
            overflow="hidden"
            maxH={{ md: 'calc(var(--admin-workspace-h, 80vh) - 90px)' }}
            overflowY="auto"
          >
            {messages.map((m, i) => {
              const active = m.id === selectedId
              return (
                <Box
                  key={m.id}
                  role="listitem"
                  borderTop={i ? '1px solid' : undefined}
                  borderColor="page.border"
                >
                  <Box
                    as="button"
                    type="button"
                    data-id={m.id}
                    w="100%"
                    textAlign="left"
                    px={4}
                    py={3}
                    bg={active ? 'page.bg-overlay' : 'transparent'}
                    _hover={{ bg: active ? 'page.bg-overlay' : 'page.bg-elevated' }}
                    _focusVisible={{ outline: '2px solid', outlineColor: 'accent.500', outlineOffset: '-2px' }}
                    transition="background 120ms ease"
                    aria-current={active ? 'true' : undefined}
                    onClick={() => open(m)}
                  >
                    <Flex align="center" gap={2}>
                      <Box
                        boxSize="7px"
                        borderRadius="full"
                        flexShrink={0}
                        bg={m.read ? 'transparent' : 'accent.500'}
                        aria-hidden
                      />
                      {!m.read ? <VisuallyHidden>Unread.</VisuallyHidden> : null}
                      <Text flex={1} minW={0} noOfLines={1} fontSize="sm" fontWeight={m.read ? 500 : 700}>
                        {m.name || m.email}
                      </Text>
                      <Text fontFamily={MONO} fontSize="10px" color="page.fg-secondary" flexShrink={0}>
                        {relative(m.at, now)}
                      </Text>
                    </Flex>
                    <Text mt={1} pl="15px" noOfLines={1} fontSize="13px" fontWeight={m.read ? 400 : 600}>
                      {m.subject || '(no subject)'}
                    </Text>
                    <Flex pl="15px" mt={0.5} gap={2} align="center">
                      <Text flex={1} minW={0} noOfLines={1} fontSize="12px" color="page.fg-secondary">
                        {m.message}
                      </Text>
                      {m.delivered === false ? (
                        <Badge variant="outline" colorScheme="orange" fontSize="9px" flexShrink={0}>
                          not emailed
                        </Badge>
                      ) : null}
                    </Flex>
                  </Box>
                </Box>
              )
            })}
          </Box>

          {/* Detail */}
          <Panel display={{ base: selected ? 'block' : 'none', md: 'block' }} minH={{ md: '320px' }}>
            {selected ? (
              <Stack spacing={4}>
                <Button
                  display={{ base: 'inline-flex', md: 'none' }}
                  alignSelf="flex-start"
                  size="sm"
                  variant="ghost"
                  leftIcon={<FaArrowLeft />}
                  onClick={() => setSelectedId(null)}
                >
                  All messages
                </Button>
                <Box>
                  <Text fontSize="xl" fontWeight={600} lineHeight="1.25" wordBreak="break-word">
                    {selected.subject || '(no subject)'}
                  </Text>
                  <Flex mt={2} gap={2} wrap="wrap" align="center" fontSize="sm">
                    <Text fontWeight={600}>{selected.name || 'Anonymous'}</Text>
                    <Text color="page.fg-secondary" wordBreak="break-all">
                      &lt;{selected.email}&gt;
                    </Text>
                    <Tooltip label={hasCopied ? 'Copied' : 'Copy address'} hasArrow>
                      <Button size="xs" variant="ghost" onClick={onCopy} aria-label="Copy email address" px={1}>
                        <FaCopy />
                      </Button>
                    </Tooltip>
                  </Flex>
                  <HStack mt={1} spacing={2} fontFamily={MONO} fontSize="11px" color="page.fg-secondary">
                    <Text>{formatWhen(selected.at)}</Text>
                    <Text aria-hidden>·</Text>
                    <Text>
                      {selected.delivered === true
                        ? 'emailed to you'
                        : selected.delivered === false
                          ? 'not emailed'
                          : 'email status unknown'}
                    </Text>
                  </HStack>
                </Box>
                <Box
                  borderTop="1px solid"
                  borderColor="page.border"
                  pt={4}
                  whiteSpace="pre-wrap"
                  wordBreak="break-word"
                  fontSize="15px"
                  lineHeight="1.7"
                >
                  {selected.message}
                </Box>
                <Flex gap={2} wrap="wrap" pt={2}>
                  <Button as="a" href={replyHref(selected)} size="sm" leftIcon={<FaReply />} {...primaryButtonProps}>
                    Reply by email
                  </Button>
                  <Button
                    size="sm"
                    leftIcon={selected.read ? <FaEnvelope /> : <FaEnvelopeOpen />}
                    {...outlineButtonProps}
                    isDisabled={busy}
                    onClick={() => act(selected.read ? 'unread' : 'read', [selected.id])}
                  >
                    Mark {selected.read ? 'unread' : 'read'}
                  </Button>
                  <Button
                    size="sm"
                    leftIcon={<FaTrashAlt />}
                    variant="ghost"
                    color="red.400"
                    _hover={{ bg: 'page.bg-overlay' }}
                    isDisabled={busy}
                    onClick={del.onOpen}
                  >
                    Delete
                  </Button>
                </Flex>
              </Stack>
            ) : (
              <Flex h="100%" minH="280px" align="center" justify="center" direction="column" color="page.fg-secondary">
                <Box as={FaEnvelopeOpen} boxSize="22px" aria-hidden />
                <Text mt={3} fontSize="sm">
                  Select a message to read it.
                </Text>
                <Text mt={1} fontFamily={MONO} fontSize="10px">
                  ↑ ↓ move through the list
                </Text>
              </Flex>
            )}
          </Panel>
        </Grid>
      ) : null}

      <AlertDialog isOpen={del.isOpen} leastDestructiveRef={cancelRef} onClose={del.onClose} isCentered>
        <AlertDialogOverlay>
          <AlertDialogContent bg="page.bg-elevated" borderColor="page.border" borderWidth="1px">
            <AlertDialogHeader fontSize="md">Delete this message?</AlertDialogHeader>
            <AlertDialogBody fontSize="sm" color="page.fg-secondary">
              It is removed from the inbox permanently. Copies in earlier full-site backups are not affected.
            </AlertDialogBody>
            <AlertDialogFooter gap={2}>
              <Button ref={cancelRef} size="sm" {...outlineButtonProps} onClick={del.onClose}>
                Cancel
              </Button>
              <Button size="sm" colorScheme="red" onClick={confirmDelete} isLoading={busy}>
                Delete
              </Button>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialogOverlay>
      </AlertDialog>
    </Stack>
  )
}
