import React from 'react'
import { Box, Button, Flex, Text } from '@chakra-ui/react'

/**
 * Error boundary for independent UI islands (a home widget, the command
 * palette, an admin panel): a crash there renders a small fallback instead
 * of blanking the whole page. Errors are reported to Sentry when a client
 * DSN was configured at build time, otherwise logged to the console.
 *
 *   <ErrorBoundary name="github-activity" fallback={(p) => <WidgetFallback {...p} />}>
 *     <ActivityFeed />
 *   </ErrorBoundary>
 */

export type FallbackProps = { error: Error; reset: () => void; name?: string }

type Props = {
  children: React.ReactNode
  /** Element, or render function receiving the error and a reset(). Default: WidgetFallback. */
  fallback?: React.ReactNode | ((props: FallbackProps) => React.ReactNode)
  /** Short identifier used in reports ("home/activity"). */
  name?: string
  onError?: (error: Error, info: React.ErrorInfo) => void
  /** When any of these change after an error, the boundary resets itself. */
  resetKeys?: unknown[]
}

type State = { error: Error | null }

function report(error: Error, info: React.ErrorInfo, name?: string) {
  if (process.env.NEXT_PUBLIC_SENTRY_DSN) {
    import('@sentry/nextjs')
      .then((Sentry) =>
        Sentry.withScope((scope) => {
          if (name) scope.setTag('boundary', name)
          scope.setExtra('componentStack', info.componentStack)
          Sentry.captureException(error)
        }),
      )
      .catch(() => {})
  } else {
    console.error(`[ErrorBoundary${name ? ` ${name}` : ''}]`, error, info.componentStack)
  }
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
    if (!this.state.error) return
    const a = prev.resetKeys || []
    const b = this.props.resetKeys || []
    if (a.length !== b.length || a.some((v, i) => !Object.is(v, b[i]))) this.reset()
  }

  reset = () => this.setState({ error: null })

  render() {
    const { error } = this.state
    if (!error) return this.props.children
    const { fallback, name } = this.props
    if (typeof fallback === 'function') return fallback({ error, reset: this.reset, name })
    if (fallback !== undefined) return fallback
    return <WidgetFallback error={error} reset={this.reset} name={name} />
  }
}

/** Compact, inline fallback for public widgets. */
export function WidgetFallback({ reset, title = 'This section couldn’t load.' }: Partial<FallbackProps> & { title?: string }) {
  return (
    <Flex
      role="status"
      align="center"
      justify="space-between"
      gap={3}
      flexWrap="wrap"
      border="1px dashed"
      borderColor="page.border"
      borderRadius="lg"
      px={4}
      py={3}
      color="page.fg-secondary"
      fontSize="sm"
    >
      <Text>{title}</Text>
      {reset ? (
        <Button size="xs" variant="ghost" onClick={reset} color="page.fg-secondary" _hover={{ color: 'page.fg', bg: 'page.bg-overlay' }}>
          Try again
        </Button>
      ) : null}
    </Flex>
  )
}

/** Fallback for admin panels: explains, offers retry and a full reload. */
export function PanelFallback({ error, reset, title = 'This panel hit an unexpected error.' }: Partial<FallbackProps> & { title?: string }) {
  return (
    <Box role="alert" border="1px solid" borderColor="page.border" borderRadius="xl" bg="page.bg-elevated" p={{ base: 4, md: 6 }}>
      <Text fontWeight={600}>{title}</Text>
      <Text mt={1} fontSize="sm" color="page.fg-secondary">
        Your saved content is safe. Unsaved edits in this panel may need to be redone.
      </Text>
      {error?.message ? (
        <Text mt={3} fontFamily="var(--font-geist-mono), monospace" fontSize="xs" color="page.fg-secondary" wordBreak="break-word">
          {error.message}
        </Text>
      ) : null}
      <Flex mt={4} gap={2} flexWrap="wrap">
        {reset ? (
          <Button size="sm" variant="outline" borderColor="page.border-strong" onClick={reset}>
            Try again
          </Button>
        ) : null}
        <Button size="sm" variant="ghost" onClick={() => window.location.reload()}>
          Reload page
        </Button>
      </Flex>
    </Box>
  )
}
