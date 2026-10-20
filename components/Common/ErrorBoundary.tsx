import React from 'react'
import { Box, Button, Flex, Text } from '@chakra-ui/react'
import { log } from '../../lib/log'
import { reportBoundaryError } from '../../lib/errors/capture'

/**
 * Error boundary for independent UI islands (a home widget, the command
 * palette, an admin panel): a crash there renders a small fallback instead
 * of blanking the whole page. Every caught error is logged.
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
 * The admin's PanelFallback lives in ./PanelFallback: this module ships in
 * the shared bundle (the ⌘K palette's boundary), the admin fallback must not.
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
  // A caught render error never reaches window.onerror: send it to the
  // first-party error monitor explicitly (no-op on the server).
  reportBoundaryError(error, name)
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
export function WidgetFallback({ reset, title = 'This section couldn’t load.', retryLabel = 'Retry' }: Partial<FallbackProps> & { title?: string; retryLabel?: string }) {
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
          {retryLabel}
        </Button>
      ) : null}
    </Flex>
  )
}
