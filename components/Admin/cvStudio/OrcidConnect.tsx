import React, { useEffect, useId, useRef, useState } from 'react'
import { Box, Button, Flex, HStack, Link, Text, useToast, type ButtonProps } from '@chakra-ui/react'
import { ORCID_GREEN, OrcidIdIcon } from '../../Icons/orcid'
import {
  ORCID_CONNECTION_PATH,
  ORCID_CONNECT_PATH,
  ORCID_DISCONNECT_CONFIRM_LINE,
  ORCID_SETUP_DOCS_URL,
  orcidConnectLine,
  orcidConnectPanel,
  type OrcidConnectStatus,
} from '../../../lib/orcid/connectUi'
import { disconnectOrcidInCv } from '../../../lib/orcid/connection'
import { outlineButtonProps } from '../shell/ui'
import { useStudio } from './StudioContext'
import { useStudioTokens } from './fields'

/**
 * "Connect your ORCID iD" next to the iD field in Personal Info (CV Studio).
 *
 * The button is ORCID's sign-in button as its OAuth sign-in guidelines
 * describe it — the iD icon as ORCID provides it, then text that says what
 * happens — in the white, hairline-bordered form ORCID's examples use, so
 * it reads as ORCID's in both themes. It is a plain link to
 * /api/admin/orcid/connect (a top-level navigation to orcid.org and back; no
 * form, no script). Connecting and disconnecting write the stored CV, so
 * both wait for unsaved changes to be saved or undone. Without ORCID
 * credentials on the server the button stays disabled and the line under it
 * says why, with a link to the set-up guide.
 *
 * The line under the row shows the iD the way the site shows it: the
 * authenticated icon once connected, the unauthenticated one for a typed-in
 * iD. States and wording: lib/orcid/connectUi.
 */

// One status read per page load (the server's setup does not change while it runs).
let statusRead: Promise<OrcidConnectStatus | 'error'> | null = null
function readStatus(): Promise<OrcidConnectStatus | 'error'> {
  if (!statusRead) {
    statusRead = fetch(ORCID_CONNECTION_PATH, { cache: 'no-store', credentials: 'same-origin' })
      .then(async (res) => (res.ok ? ((await res.json()) as OrcidConnectStatus) : 'error' as const))
      .catch(() => 'error' as const)
    statusRead.then((s) => {
      if (s === 'error') statusRead = null
    })
  }
  return statusRead
}

const formatDate = (iso: string) => {
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? iso.slice(0, 10) : d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

/** ORCID's sign-in button: white, hairline border, the iD icon, plain dark text. */
const orcidButton: ButtonProps = {
  size: 'sm',
  h: '32px',
  px: 3,
  flexShrink: 0,
  borderRadius: 'md',
  fontSize: '13px',
  fontWeight: 600,
  bg: 'white',
  color: 'gray.800',
  border: '1px solid',
  borderColor: 'gray.300',
  boxShadow: '0 1px 2px rgba(0, 0, 0, 0.08)',
  iconSpacing: 2,
  transition: 'border-color var(--duration-fast) var(--ease-standard), background-color var(--duration-fast) var(--ease-standard)',
  _hover: { bg: 'gray.50', borderColor: ORCID_GREEN, textDecoration: 'none', _disabled: { bg: 'transparent', borderColor: 'page.border-strong' } },
  _active: { bg: 'gray.100' },
  _focusVisible: { outline: '2px solid var(--accent)', outlineOffset: '2px', boxShadow: 'none' },
  // Unavailable: a quiet outline — the iD icon itself stays as ORCID provides it (never dimmed).
  _disabled: { opacity: 1, cursor: 'not-allowed', boxShadow: 'none', bg: 'transparent', color: 'page.fg-secondary', borderColor: 'page.border-strong', borderStyle: 'dashed' },
}

export default function OrcidConnect({ pi, children }: { pi: unknown; children: React.ReactNode }) {
  const api = useStudio()
  const toast = useToast()
  const { dim } = useStudioTokens()
  const lineId = useId()
  const [status, setStatus] = useState<OrcidConnectStatus | 'error' | null>(null)
  const [leaving, setLeaving] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [busy, setBusy] = useState(false)
  const focusAfter = useRef<'connect' | 'disconnect' | 'confirm' | null>(null)
  const connectRef = useRef<HTMLElement | null>(null)
  const disconnectRef = useRef<HTMLButtonElement | null>(null)
  const confirmRef = useRef<HTMLButtonElement | null>(null)

  useEffect(() => {
    let live = true
    readStatus().then((s) => {
      if (live) setStatus(s)
    })
    // Back from ORCID with the browser's Back button: the page comes from the back/forward cache.
    const onShow = (e: PageTransitionEvent) => {
      if (e.persisted) setLeaving(false)
    }
    window.addEventListener('pageshow', onShow)
    return () => {
      live = false
      window.removeEventListener('pageshow', onShow)
    }
  }, [])

  const panel = orcidConnectPanel({ status, pi, dirty: !!api.dirty })
  const sandbox = status && status !== 'error' && status.configured && status.env === 'sandbox'
  const typedId = typeof (pi as { orcid?: unknown } | null)?.orcid === 'string' && !!(pi as { orcid: string }).orcid.trim()

  // Keep keyboard focus on the row when a control is swapped for another.
  useEffect(() => {
    const target = focusAfter.current
    if (!target) return
    focusAfter.current = null
    const el = target === 'connect' ? connectRef.current : target === 'confirm' ? confirmRef.current : disconnectRef.current
    el?.focus()
  })

  const disconnect = async () => {
    const server = api.serverChange
    if (!server) return
    setBusy(true)
    try {
      const etag = server.etag()
      const res = await fetch(ORCID_CONNECTION_PATH, {
        method: 'DELETE',
        credentials: 'same-origin',
        headers: etag ? { 'If-Match': etag } : {},
      })
      const body = (await res.json().catch(() => ({}))) as { changed?: boolean; etag?: string; error?: string }
      if (res.status === 401) {
        toast({ status: 'error', title: 'Session expired', description: 'Sign in again, then disconnect.', position: 'bottom-right', isClosable: true })
        return
      }
      if (!res.ok) {
        toast({ status: res.status === 409 ? 'warning' : 'error', title: 'Not disconnected', description: body.error || `The server answered ${res.status}.`, position: 'bottom-right', isClosable: true })
        return
      }
      if (body.changed && body.etag) server.adopt(disconnectOrcidInCv(server.current()).doc, body.etag)
      focusAfter.current = 'connect'
      toast({
        status: 'success',
        title: 'ORCID iD disconnected',
        description: 'It stays on your CV, shown as “(unauthenticated)”. Connect again at any time; to remove it, clear the field.',
        position: 'bottom-right',
        isClosable: true,
      })
    } catch {
      toast({ status: 'error', title: 'Not disconnected', description: 'The server could not be reached.', position: 'bottom-right', isClosable: true })
    } finally {
      setBusy(false)
      setConfirming(false)
    }
  }

  let action: React.ReactNode
  if (panel.kind === 'connected') {
    action = confirming ? (
      <HStack spacing={2} role="group" aria-label="Disconnect your ORCID iD?" aria-describedby={lineId} flexShrink={0}>
        <Button
          ref={confirmRef}
          size="sm"
          h="32px"
          colorScheme="red"
          variant="outline"
          isLoading={busy}
          loadingText="Disconnecting"
          onClick={disconnect}
        >
          Disconnect
        </Button>
        <Button
          size="sm"
          h="32px"
          variant="ghost"
          isDisabled={busy}
          onClick={() => {
            focusAfter.current = 'disconnect'
            setConfirming(false)
          }}
        >
          Cancel
        </Button>
      </HStack>
    ) : (
      <Button
        ref={disconnectRef}
        size="sm"
        h="32px"
        flexShrink={0}
        {...outlineButtonProps}
        isDisabled={panel.dirty || !api.serverChange}
        aria-describedby={lineId}
        onClick={() => {
          focusAfter.current = 'confirm'
          setConfirming(true)
        }}
      >
        Disconnect…
      </Button>
    )
  } else if (panel.kind === 'unauthenticated') {
    action = (
      <Button
        as="a"
        ref={connectRef as React.Ref<HTMLButtonElement>}
        href={ORCID_CONNECT_PATH}
        {...orcidButton}
        leftIcon={<OrcidIdIcon size={20} />}
        aria-describedby={lineId}
        isLoading={leaving}
        loadingText="Opening ORCID…"
        spinnerPlacement="start"
        onClick={() => setLeaving(true)}
        data-testid="orcid-connect"
      >
        Connect your ORCID iD
      </Button>
    )
  } else {
    action = (
      <Button {...orcidButton} isDisabled leftIcon={<OrcidIdIcon size={20} />} aria-describedby={lineId} data-testid="orcid-connect">
        Connect your ORCID iD
      </Button>
    )
  }

  // The line shows the iD as the site shows it, when the line is about the iD.
  const icon = panel.kind === 'connected' ? 'authenticated' : panel.kind === 'unauthenticated' && typedId ? 'unauthenticated' : null

  return (
    <Box>
      <Flex gap={2} direction={{ base: 'column', sm: 'row' }} align={{ base: 'stretch', sm: 'center' }}>
        <Box flex="1" minW={0}>
          {children}
        </Box>
        <Flex justify="flex-start">{action}</Flex>
      </Flex>
      <HStack mt={1.5} spacing={1.5} align="flex-start" data-testid="orcid-connect-status" data-state={panel.kind}>
        {icon ? <OrcidIdIcon size={16} authenticated={icon === 'authenticated'} style={{ flexShrink: 0, marginTop: 1 }} /> : null}
        <Text id={lineId} fontSize="12px" lineHeight="1.5" color={dim} minW={0}>
          {confirming && panel.kind === 'connected' ? ORCID_DISCONNECT_CONFIRM_LINE : orcidConnectLine(panel, formatDate)}
          {panel.kind === 'unconfigured' && panel.problem !== 'unknown' ? (
            <>
              {' '}
              <Link href={ORCID_SETUP_DOCS_URL} isExternal color="accent.text" textDecoration="underline" textUnderlineOffset="2px" whiteSpace="nowrap">
                Set-up guide
                <Box as="span" className="sr-only">
                  {' '}
                  (opens in a new tab)
                </Box>
              </Link>
            </>
          ) : null}
          {sandbox ? ' Uses the ORCID sandbox (sandbox.orcid.org): test records only.' : null}
        </Text>
      </HStack>
    </Box>
  )
}
