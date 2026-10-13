import React from 'react'
import EmptyState from '../General-UI/EmptyState'

/**
 * Calm, in-place empty / error state for data widgets (GitHub stats, repos,
 * languages, activity): the inline variant of the site's one EmptyState
 * (components/General-UI/EmptyState.tsx). Takes the widget's own min height
 * so swapping the skeleton for this notice never shifts the page.
 */
export default function WidgetNotice({
  kind,
  children,
  onRetry,
  minH,
}: {
  kind: 'empty' | 'error'
  children: React.ReactNode
  onRetry?: () => void
  minH?: string | Record<string, string>
}) {
  return (
    <EmptyState variant="inline" tone={kind} role={kind === 'error' ? 'status' : undefined} onRetry={onRetry} minH={minH}>
      {children}
    </EmptyState>
  )
}
