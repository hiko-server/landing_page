import React, { useEffect, useRef, useState } from 'react'
import NextLink from 'next/link'
import {
  Alert,
  AlertDescription,
  AlertIcon,
  Box,
  Button,
  Flex,
  HStack,
  Heading,
  Kbd,
  Link,
  Text,
  VisuallyHidden,
  Wrap,
  WrapItem,
  type BoxProps,
  type ButtonProps,
} from '@chakra-ui/react'
import { keyframes } from '@emotion/react'
import HeaderFooter from '../../../layout/HeaderFooter'
import CustomHead from '../../General-UI/CustomHead'
import { isSaveShortcut } from './shortcuts'
import { loginHref } from './http'
import ShortcutsOverlay from './ShortcutsOverlay'

/**
 * Admin shell primitives — the v6 public look (near-black / paper, 1px
 * hairlines, Geist Mono eyebrows, single indigo accent) for every admin
 * surface, built only on the page.* semantic tokens so dark and light mode
 * stay in lockstep with the public site.
 */

export const MONO = 'var(--font-geist-mono), ui-monospace, "SF Mono", Consolas, monospace'
export const EASE = 'cubic-bezier(0.22, 1, 0.36, 1)'
/** Height of the site header (layout/HeaderFooter → components/Header). */
export const SITE_HEADER_H = '56px'

/**
 * Primary (indigo) action button styling: the contrast-safe filled shade
 * (accent.solid, white text ≥ 4.5:1 in both modes — accent.500 is 4.47:1).
 */
export const primaryButtonProps: ButtonProps = {
  bg: 'accent.solid',
  color: 'accent.fg',
  _hover: { bg: 'accent.solid-hover', _disabled: { bg: 'accent.solid' } },
  _active: { bg: 'accent.solid-active' },
}

/** Hairline-bordered secondary button styling. */
export const outlineButtonProps: ButtonProps = {
  variant: 'outline',
  borderColor: 'page.border-strong',
  color: 'page.fg',
  _hover: { bg: 'page.bg-overlay' },
}

/** Warning text that meets 4.5:1 in both themes (orange.400 does not on white). */
export const warnTextProps = { color: 'orange.700', _dark: { color: 'orange.300' } } as const

/** Shared input props: indigo focus ring on hairline borders. */
export const inputProps = {
  focusBorderColor: 'accent.500',
  borderColor: 'page.border-strong',
  _hover: { borderColor: 'page.muted' },
} as const

export function Eyebrow({
  children,
  accent = false,
  ...rest
}: { children: React.ReactNode; accent?: boolean } & BoxProps) {
  return (
    <Box
      as="span"
      display="block"
      fontFamily={MONO}
      fontSize="10px"
      letterSpacing="0.16em"
      textTransform="uppercase"
      color={accent ? 'accent.text' : 'page.fg-secondary'}
      {...rest}
    >
      {children}
    </Box>
  )
}

/** "[01] Hero" — the public site's numbered mono section label. */
export function SectionLabel({
  index,
  title,
  hint,
  id,
  action,
}: {
  index: number
  title: string
  hint?: React.ReactNode
  id?: string
  action?: React.ReactNode
}) {
  return (
    <Box
      mt={10}
      mb={4}
      pb={3}
      borderBottom="1px solid"
      borderColor="page.border"
      _first={{ mt: 0 }}
    >
      <Flex align="baseline" justify="space-between" gap={3} flexWrap="wrap">
        <Heading
          as="h2"
          id={id}
          fontSize="sm"
          fontWeight={600}
          letterSpacing="-0.005em"
          display="flex"
          alignItems="baseline"
          gap={2.5}
        >
          <Box
            as="span"
            fontFamily={MONO}
            fontSize="11px"
            fontWeight={500}
            color="accent.text"
            letterSpacing="0.06em"
          >
            [{String(index).padStart(2, '0')}]
          </Box>
          {title}
        </Heading>
        {action}
      </Flex>
      {hint ? (
        <Text fontSize="xs" color="page.fg-secondary" mt={1.5} maxW="70ch">
          {hint}
        </Text>
      ) : null}
    </Box>
  )
}

/** Hairline card. */
export function Panel({ children, ...rest }: { children: React.ReactNode } & BoxProps) {
  return (
    <Box
      border="1px solid"
      borderColor="page.border"
      borderRadius="xl"
      bg="page.bg"
      p={{ base: 4, md: 5 }}
      {...rest}
    >
      {children}
    </Box>
  )
}

export type SaveState = 'clean' | 'dirty' | 'saving' | 'error' | 'loading'

const SAVE_COPY: Record<SaveState, string> = {
  clean: 'All changes saved',
  dirty: 'Unsaved changes',
  saving: 'Saving…',
  error: 'Not loaded',
  loading: 'Loading…',
}

const SAVED_AGO_REFRESH_MS = 15_000

/** "just now", "12 sec. ago", "3 min. ago", … (Intl.RelativeTimeFormat, English UI). */
export function formatSavedAgo(savedAt: number, now: number): string {
  const s = Math.max(0, Math.round((now - savedAt) / 1000))
  if (s < 10) return 'just now'
  const rtf = new Intl.RelativeTimeFormat('en', { numeric: 'auto', style: 'short' })
  if (s < 60) return rtf.format(-s, 'second')
  if (s < 3600) return rtf.format(-Math.floor(s / 60), 'minute')
  if (s < 86400) return rtf.format(-Math.floor(s / 3600), 'hour')
  return rtf.format(-Math.floor(s / 86400), 'day')
}

/** Current time, re-read every `intervalMs` while `active` (null = paused). */
function useNow(active: boolean, intervalMs: number): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!active) return
    setNow(Date.now())
    const id = window.setInterval(() => setNow(Date.now()), intervalMs)
    return () => window.clearInterval(id)
  }, [active, intervalMs])
  return now
}

const dotPulse = keyframes`
  0%, 80%, 100% { opacity: 0.25; }
  40% { opacity: 1; }
`

/** Three mono dots blinking in turn; static under reduced motion. */
function SavingDots() {
  return (
    <Box
      as="span"
      display="inline-flex"
      aria-hidden
      sx={{
        '& > span': { animation: `${dotPulse} 1.2s ease-in-out infinite` },
        '& > span:nth-of-type(2)': { animationDelay: '0.2s' },
        '& > span:nth-of-type(3)': { animationDelay: '0.4s' },
        '@media (prefers-reduced-motion: reduce)': { '& > span': { animation: 'none', opacity: 1 } },
      }}
    >
      <span>.</span>
      <span>.</span>
      <span>.</span>
    </Box>
  )
}

/**
 * Dot + label for the editor's save state. The polite live region carries
 * only the state ("Saved", "Unsaved changes", "Saving…"), so screen readers
 * hear changes, not a ticking clock; the relative "· 12 sec. ago" next to it
 * is aria-hidden and refreshed every 15 s. Pass `savedAt` (ms) after a save.
 */
export function SaveStatus({ state, label, savedAt }: { state: SaveState; label?: string; savedAt?: number }) {
  const showAgo = state === 'clean' && !label && typeof savedAt === 'number' && savedAt > 0
  const now = useNow(showAgo, SAVED_AGO_REFRESH_MS)
  const dot =
    state === 'dirty'
      ? 'orange.400'
      : state === 'error'
        ? 'red.400'
        : state === 'clean'
          ? 'green.400'
          : 'page.muted'
  const text = label || (showAgo ? 'Saved' : SAVE_COPY[state])
  return (
    <HStack spacing={2} fontFamily={MONO} fontSize="11px" color="page.fg-secondary" minW={0}>
      <Box
        w="7px"
        h="7px"
        borderRadius="full"
        bg={dot}
        flexShrink={0}
        aria-hidden
        transition="background-color 180ms var(--ease-out-quart, ease-out)"
      />
      <Text as="span" noOfLines={1}>
        <Box as="span" role="status" aria-live="polite" aria-atomic="true">
          {state === 'saving' && !label ? (
            <>
              <VisuallyHidden>Saving…</VisuallyHidden>
              <Box as="span" aria-hidden>
                Saving
                <SavingDots />
              </Box>
            </>
          ) : (
            text
          )}
        </Box>
        {showAgo ? (
          <Box as="span" aria-hidden className="tnum">
            {' · '}
            {formatSavedAgo(savedAt as number, Math.max(now, savedAt as number))}
          </Box>
        ) : null}
      </Text>
    </HStack>
  )
}

/** Small keyboard hint, e.g. <KbdHint keys={['⌘', 'S']} />. Hidden on touch-sized screens. */
export function KbdHint({ keys, label }: { keys: string[]; label?: string }) {
  return (
    <HStack
      spacing={1}
      display={{ base: 'none', md: 'flex' }}
      color="page.fg-secondary"
      aria-hidden
    >
      {keys.map((k) => (
        <Kbd
          key={k}
          fontSize="10px"
          bg="page.bg-elevated"
          borderColor="page.border-strong"
          color="page.fg-secondary"
        >
          {k}
        </Kbd>
      ))}
      {label ? (
        <Text fontFamily={MONO} fontSize="10px">
          {label}
        </Text>
      ) : null}
    </HStack>
  )
}

/** Public pages refreshed by a save, as links. */
export function RevalidatedPaths({ paths }: { paths: string[] }) {
  if (!paths.length) return null
  return (
    <Flex
      align="center"
      gap={2}
      flexWrap="wrap"
      fontFamily={MONO}
      fontSize="11px"
      color="page.fg-secondary"
      role="status"
    >
      <Text as="span">Live now:</Text>
      <Wrap spacing={1.5} as="span">
        {paths.map((p) => (
          <WrapItem key={p} as="span">
            <Link
              href={p}
              isExternal
              px={1.5}
              py={0.5}
              borderRadius="sm"
              border="1px solid"
              borderColor="page.border"
              color="page.fg"
              _hover={{ borderColor: 'accent.500', color: 'accent.500', textDecoration: 'none' }}
            >
              {p}
              <Box as="span" srOnly>
                {' '}
                (opens in a new tab)
              </Box>
            </Link>
          </WrapItem>
        ))}
      </Wrap>
    </Flex>
  )
}

/** Shown instead of an editor when its data could not be loaded. */
export function LoadErrorNotice({
  what,
  error,
  onRetry,
}: {
  what: string
  error: string
  onRetry?: () => void
}) {
  return (
    <Alert
      status="error"
      variant="left-accent"
      borderRadius="md"
      alignItems="center"
      gap={3}
      flexWrap="wrap"
      bg="page.bg-elevated"
    >
      <AlertIcon />
      <AlertDescription flex={1} fontSize="sm" minW="200px">
        Couldn’t load {what} ({error}). Saving is disabled so an empty form can’t overwrite the live
        content.
      </AlertDescription>
      {onRetry ? (
        <Button size="sm" {...outlineButtonProps} onClick={onRetry}>
          Retry
        </Button>
      ) : null}
    </Alert>
  )
}

/** Session ended (401 or a non-admin view): offer a sign-in that returns here. */
export function SessionExpiredNotice({
  returnPath,
  keepEdits = false,
}: {
  returnPath: string
  keepEdits?: boolean
}) {
  return (
    <Alert
      status="warning"
      variant="left-accent"
      borderRadius="md"
      alignItems="center"
      gap={3}
      flexWrap="wrap"
      bg="page.bg-elevated"
      role="alert"
    >
      <AlertIcon />
      <AlertDescription flex={1} fontSize="sm" minW="200px">
        Your admin session has expired.{' '}
        {keepEdits
          ? 'Sign in again in a new tab, then come back and save — your edits here are kept.'
          : 'Sign in again to keep editing.'}
      </AlertDescription>
      <Button
        as="a"
        href={loginHref(returnPath)}
        target={keepEdits ? '_blank' : undefined}
        rel={keepEdits ? 'noopener' : undefined}
        size="sm"
        {...primaryButtonProps}
      >
        Sign in{keepEdits ? ' (new tab)' : ''}
      </Button>
    </Alert>
  )
}

/**
 * Slim sticky title bar that sits right under the site header: eyebrow +
 * title on the left, status and actions on the right, optional second slot
 * (tabs) in the same bar. It also mounts the "?" keyboard-shortcuts overlay,
 * so every admin page with a title bar has it.
 */
export function AdminTitleBar({
  eyebrow,
  title,
  status,
  actions,
  children,
  maxW = 'var(--container-content)',
}: {
  eyebrow: React.ReactNode
  title: React.ReactNode
  status?: React.ReactNode
  actions?: React.ReactNode
  children?: React.ReactNode
  maxW?: string
}) {
  return (
    <Box
      position="sticky"
      top={SITE_HEADER_H}
      zIndex={30}
      bg="page.surface"
      backdropFilter="saturate(180%) blur(14px)"
      borderBottom="1px solid"
      borderColor="page.border"
      className="no-print"
      // Measured by sticky bars below it (editor/FindReplacePanel).
      data-admin-titlebar=""
    >
      <Flex
        maxW={maxW}
        mx="auto"
        px={{ base: 4, md: 6, lg: 8 }}
        py={2}
        minH="52px"
        align="center"
        justify="space-between"
        gap={{ base: 2, md: 4 }}
        flexWrap="wrap"
      >
        <Flex align="center" gap={{ base: 3, md: 5 }} minW={0} flex="1 1 auto" flexWrap="wrap">
          <Box minW={0}>
            <Eyebrow accent>{eyebrow}</Eyebrow>
            <Heading
              as="h1"
              fontSize={{ base: 'md', md: 'lg' }}
              fontWeight={600}
              letterSpacing="-0.02em"
              noOfLines={1}
            >
              {title}
            </Heading>
          </Box>
          {children}
        </Flex>
        {/* Beside the title the row's space-between puts this group at the far
            end; once it wraps (a phone, a long title, a long save state) its
            rows start under the title instead of hanging off the right edge.
            The actions move as one group: they split over two rows only when
            they alone are wider than the bar. */}
        <HStack spacing={{ base: 2, md: 3 }} rowGap={2} flexShrink={1} minW={0} maxW="100%" flexWrap="wrap" justify="flex-start">
          {status}
          <HStack spacing={{ base: 2, md: 3 }} rowGap={2} flexShrink={1} minW={0} maxW="100%" flexWrap="wrap">
            {actions}
            <ShortcutsOverlay />
          </HStack>
        </HStack>
      </Flex>
    </Box>
  )
}

/** Page chrome for standalone admin pages (blog, work, now, uses, db-config). */
export function AdminPageShell({
  headTitle,
  eyebrow,
  title,
  status,
  actions,
  children,
  maxW = 'var(--container-content)',
}: {
  headTitle: string
  eyebrow: React.ReactNode
  title: React.ReactNode
  status?: React.ReactNode
  actions?: React.ReactNode
  children: React.ReactNode
  maxW?: string
}) {
  return (
    <>
      <CustomHead title={headTitle} noindex />
      <HeaderFooter>
        <AdminTitleBar
          eyebrow={eyebrow}
          title={title}
          status={status}
          actions={actions}
          maxW={maxW}
        />
        <Box maxW={maxW} mx="auto" w="100%" px={{ base: 4, md: 6, lg: 8 }} py={{ base: 5, md: 8 }}>
          {children}
        </Box>
      </HeaderFooter>
    </>
  )
}

/** Back link styled for the title bar. */
export function BackLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Button
      as={NextLink}
      href={href}
      size="sm"
      variant="ghost"
      color="page.fg-secondary"
      _hover={{ color: 'page.fg', bg: 'page.bg-overlay' }}
    >
      {children}
    </Button>
  )
}

/**
 * ⌘S / Ctrl+S → onSave, only while `enabled` (e.g. dirty and loaded). When
 * disabled the browser's own "Save page" is suppressed too, so a stray ⌘S
 * in the admin never downloads the HTML.
 */
export function useSaveShortcut(enabled: boolean, onSave: () => void) {
  const ref = useRef(onSave)
  ref.current = onSave
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!isSaveShortcut(e)) return
      e.preventDefault()
      if (enabled && !e.repeat) ref.current()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [enabled])
}

/** macOS / iOS detection after mount (SSR renders the non-Mac labels). */
export function useIsMac(): boolean {
  const [isMac, setIsMac] = useState(false)
  useEffect(() => {
    const nav = navigator as Navigator & { userAgentData?: { platform?: string } }
    const platform = nav.userAgentData?.platform || nav.platform || nav.userAgent
    setIsMac(/mac|iphone|ipad|ipod/i.test(platform))
  }, [])
  return isMac
}

/** Save-shortcut label for the current platform. */
export function useSaveKeys(): string[] {
  return useIsMac() ? ['⌘', 'S'] : ['Ctrl', 'S']
}

/** Primary Save with loading state and the platform's ⌘S / Ctrl+S hint. */
export function SaveButton({
  onSave,
  canSave,
  saving,
  label = 'Save',
}: {
  onSave: () => void
  canSave: boolean
  saving: boolean
  label?: string
}) {
  const keys = useSaveKeys()
  return (
    <HStack spacing={2}>
      <KbdHint keys={keys} />
      <Button
        size="sm"
        {...primaryButtonProps}
        onClick={onSave}
        isDisabled={!canSave}
        isLoading={saving}
        loadingText="Saving"
        aria-keyshortcuts={keys[0] === '⌘' ? 'Meta+S' : 'Control+S'}
      >
        {label}
      </Button>
    </HStack>
  )
}
