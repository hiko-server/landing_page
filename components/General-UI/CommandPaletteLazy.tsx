import dynamic from 'next/dynamic'
import ErrorBoundary from '../Common/ErrorBoundary'
import type { CommandPaletteProps } from './CommandPalette'

/**
 * The ⌘K palette as its own chunk: nothing of it ships in the shared _app
 * bundle. The header renders this only once the palette has been asked for
 * and warms the chunk earlier (search-button hover / focus, browser idle
 * time) through preloadCommandPalette(), so opening still feels instant.
 *
 * A crash inside the palette must never take the page down: the boundary
 * renders nothing and retries the next time the palette opens or closes.
 */

const loadCommandPalette = () => import('./CommandPalette')

const CommandPalette = dynamic(loadCommandPalette, { ssr: false, loading: () => null })

/** Fetch the palette chunk ahead of time (idempotent; failures are ignored and retried on demand). */
export function preloadCommandPalette(): void {
  loadCommandPalette().catch(() => undefined)
}

export default function CommandPaletteLazy(props: CommandPaletteProps) {
  return (
    <ErrorBoundary name="command-palette" fallback={null} resetKeys={[props.isOpen]}>
      <CommandPalette {...props} />
    </ErrorBoundary>
  )
}
