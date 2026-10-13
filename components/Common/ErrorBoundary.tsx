import React, { useState } from 'react'
import { Box, Button, Flex, Text } from '@chakra-ui/react'
import { copyText } from '../MDX/clipboard'
import { log } from '../../lib/log'

/**
 * Error boundary for independent UI islands (a home widget, the command
 * palette, an admin panel): a crash there renders a small fallback instead
 * of blanking the whole page. Every caught error is logged; it is also
 * reported to Sentry when a client DSN was configured at build time (the SDK
 * is imported only then).
 *
 *   <ErrorBoundary name="home/activity">
 *     <ActivityFeed />
 *   </ErrorBoundary>
 *
 *   <ErrorBoundary name="admin/home" resetKeys={[tab]} getUnsaved={() => draftRef.current}
 *     fallback={(p) => <PanelFallback {...p} />}>
 *     <HomeEditor />
 *   </ErrorBoundary>
 *
 * Fallbacks never animate.
 */

/**
 * Returns the panel's unsaved edits (a string, or any JSON-serialisable
 * value) so the admin can copy them out of a crashed editor; null/undefined
 * when there is nothing unsaved.
 */
export type GetUnsaved = () => unknown

export type FallbackProps = { error: Error; reset: () => void; name?: string; getUnsaved?: GetUnsaved }

type Props = {
  children: React.ReactNode
  /** Element, or render function receiving the error and a reset(). Default: WidgetFallback. */
  fallback?: React.ReactNode | ((props: FallbackProps) => React.ReactNode)
  /** Short identifier used in reports ("home/activity"). */
  name?: string
  onError?: (error: Error, info: React.ErrorInfo) => void
  /** When any of these change after an error, the boundary resets itself. */
  resetKeys?: unknown[]
  /** Passed to the fallback, which offers "Copy unsaved changes" (PanelFallback). */
  getUnsaved?: GetUnsaved
}

type State = { error: Error | null }

function report(error: Error, info: React.ErrorInfo, name?: string) {
  log.error('UI error boundary caught an error', {
    boundary: name || 'unnamed',
    err: error,
    componentStack: info.componentStack,
  })
  if (!process.env.NEXT_PUBLIC_SENTRY_DSN) return
  import('@sentry/nextjs')
    .then((Sentry) =>
      Sentry.withScope((scope) => {
        if (name) scope.setTag('boundary', name)
        scope.setExtra('componentStack', info.componentStack)
        Sentry.captureException(error)
      }),
    )
    .catch((reportErr: unknown) => log.warn('Sentry report failed', { err: reportErr }))
}

/** Did any reset key change (by identity, or the list length)? */
export function resetKeysChanged(prev: unknown[] = [], next: unknown[] = []): boolean {
  return prev.length !== next.length || prev.some((v, i) => !Object.is(v, next[i]))
}

export default class ErrorBoundary extends React.Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    report(error, info, this.props.name)
    this.props.onError?.(error, info)
  }

  componentDidUpdate(prev: Props) {
    if (this.state.error && resetKeysChanged(prev.resetKeys, this.props.resetKeys)) this.reset()
  }

  reset = () => this.setState({ error: null })

  render() {
    const { error } = this.state
    if (!error) return this.props.children
    const { fallback, name, getUnsaved } = this.props
    const props: FallbackProps = { error, reset: this.reset, name, getUnsaved }
    if (typeof fallback === 'function') return fallback(props)
    if (fallback !== undefined) return fallback
    return <WidgetFallback {...props} />
  }
}

const MONO = 'var(--font-geist-mono), ui-monospace, monospace'

/**
 * Compact, inline fallback for public widgets — the WidgetNotice look
 * (dashed hairline, accent dot, mono caption) with a Retry button.
 */
export function WidgetFallback({ reset, title = 'This section couldn’t load.' }: Partial<FallbackProps> & { title?: string }) {
  return (
    <Flex
      role="alert"
      align="center"
      justify="space-between"
      gap={3}
      flexWrap="wrap"
      w="100%"
      px={4}
      py={3}
      border="1px dashed"
      borderColor="page.border-strong"
      borderRadius="lg"
    >
      <Flex align="center" gap={2.5} minW={0}>
        <Box as="span" aria-hidden w="6px" h="6px" borderRadius="full" flexShrink={0} bg="var(--accent)" />
        <Text fontFamily={MONO} fontSize="12px" letterSpacing="0.02em" color="page.fg-secondary">
          {title}
        </Text>
      </Flex>
      {reset ? (
        <Button
          size="xs"
          minH="24px"
          variant="outline"
          fontFamily={MONO}
          fontWeight={400}
          borderColor="page.border-strong"
          color="page.fg"
          onClick={reset}
          _hover={{ borderColor: 'var(--accent)', color: 'accent.text' }}
          _focusVisible={{ outline: '2px solid var(--accent)', outlineOffset: '2px' }}
        >
          Retry
        </Button>
      ) : null}
    </Flex>
  )
}

/** Text the "Copy unsaved changes" button puts on the clipboard; null when there is nothing to copy. */
export function unsavedText(getUnsaved: GetUnsaved): string | null {
  const value = getUnsaved()
  if (value === null || value === undefined) return null
  if (typeof value === 'string') return value.length ? value : null
  return JSON.stringify(value, null, 2)
}

type CopyState = 'idle' | 'copied' | 'empty' | 'failed'

const COPY_STATUS: Record<CopyState, string> = {
  idle: '',
  copied: 'Unsaved changes copied to the clipboard.',
  empty: 'There are no unsaved changes to copy.',
  failed: 'Could not copy — your browser blocked clipboard access.',
}

/** Fallback for admin panels: explains, offers retry, a full reload and (when available) copying unsaved edits. */
export function PanelFallback({
  error,
  reset,
  getUnsaved,
  title = 'This panel hit an unexpected error.',
}: Partial<FallbackProps> & { title?: string }) {
  const [copy, setCopy] = useState<CopyState>('idle')

  const copyUnsaved = async () => {
    if (!getUnsaved) return
    let text: string | null
    try {
      text = unsavedText(getUnsaved)
    } catch (err) {
      log.warn('could not read unsaved changes from the crashed panel', { err })
      setCopy('failed')
      return
    }
    if (text === null) {
      setCopy('empty')
      return
    }
    setCopy((await copyText(text)) ? 'copied' : 'failed')
  }

  return (
    <Box role="alert" border="1px solid" borderColor="page.border" borderRadius="xl" bg="page.bg-elevated" p={{ base: 4, md: 6 }}>
      <Text as="span" display="block" fontFamily={MONO} fontSize="11px" letterSpacing="0.12em" color="accent.text">
        [ERR]
      </Text>
      <Text mt={1} fontWeight={600}>
        {title}
      </Text>
      <Text mt={1} fontSize="sm" color="page.fg-secondary">
        {getUnsaved
          ? 'Your saved content is safe. Copy your unsaved edits before retrying or reloading.'
          : 'Your saved content is safe. Unsaved edits in this panel may need to be redone.'}
      </Text>
      {error?.message ? (
        <Text mt={3} fontFamily={MONO} fontSize="xs" color="page.fg-secondary" wordBreak="break-word">
          {error.message}
        </Text>
      ) : null}
      <Flex mt={4} gap={2} flexWrap="wrap">
        {reset ? (
          <Button size="sm" variant="outline" borderColor="page.border-strong" onClick={reset}>
            Retry
          </Button>
        ) : null}
        {getUnsaved ? (
          <Button size="sm" variant="outline" borderColor="page.border-strong" onClick={() => void copyUnsaved()}>
            Copy unsaved changes
          </Button>
        ) : null}
        <Button size="sm" variant="ghost" onClick={() => window.location.reload()}>
          Reload page
        </Button>
      </Flex>
      <Text role="status" aria-live="polite" mt={copy === 'idle' ? 0 : 3} fontSize="xs" color="page.fg-secondary">
        {COPY_STATUS[copy]}
      </Text>
    </Box>
  )
}
