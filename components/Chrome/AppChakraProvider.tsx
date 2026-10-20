import { useEffect, useState, type ReactNode } from 'react'
import dynamic from 'next/dynamic'
import {
  CSSReset,
  ColorModeProvider,
  EnvironmentProvider,
  GlobalStyle,
  ThemeProvider,
  ToastOptionProvider,
  type ColorModeProviderProps,
  type UseToastOptions,
} from '@chakra-ui/react'
import { hasPendingToasts, watchToasts } from './toastWatch'

/**
 * Chakra's provider stack (G5): what `ChakraProvider` renders — theme,
 * colour mode, CSS reset, global styles, environment, toast defaults —
 * except that the toast host is not in the shared bundle: ./ToastHost.tsx
 * (the app's own host for Chakra's toast store, animated with the
 * LazyMotion features instead of framer-motion's full `motion` element)
 * loads in a chunk of its own once the browser is idle after the page has
 * loaded, or immediately when a toast is raised before that, and from then
 * on stays mounted.
 *
 * The host is mounted with no toast showing whenever possible, because its
 * `aria-live` regions must exist before a message is put into them for
 * screen readers to announce it.
 *
 * Importing `ChakraProvider` would also pull in Chakra's complete default
 * theme (every component's styles) on top of the app's own theme
 * (theme/chakra.js), which lists the component styles it uses.
 */

const ToastHost = dynamic(() => import('./ToastHost'), { ssr: false, loading: () => null })

type Props = {
  children: ReactNode
  theme: Record<string, any>
  colorModeManager?: ColorModeProviderProps['colorModeManager']
  /** Defaults for every `useToast()` toast (variant, placement, duration…). */
  toastOptions?: { defaultOptions?: UseToastOptions }
}

/** True once the toast host should be on the page (see the header comment). */
function useToastHostNeeded(): boolean {
  const [needed, setNeeded] = useState(false)
  useEffect(() => {
    if (needed) return
    if (hasPendingToasts()) {
      setNeeded(true)
      return
    }
    // A toast raised before the idle mount brings the host in at once.
    const stopWatching = watchToasts(() => setNeeded(true))
    let idle = 0
    let timer: ReturnType<typeof setTimeout> | undefined
    const mount = () => setNeeded(true)
    const onIdle = () => {
      const w = window as Window & { requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number }
      if (w.requestIdleCallback) idle = w.requestIdleCallback(mount, { timeout: 4000 })
      else timer = setTimeout(mount, 1500)
    }
    if (document.readyState === 'complete') onIdle()
    else window.addEventListener('load', onIdle, { once: true })
    return () => {
      stopWatching()
      window.removeEventListener('load', onIdle)
      const w = window as Window & { cancelIdleCallback?: (id: number) => void }
      if (idle && w.cancelIdleCallback) w.cancelIdleCallback(idle)
      if (timer) clearTimeout(timer)
    }
  }, [needed])
  return needed
}

export default function AppChakraProvider({ children, theme, colorModeManager, toastOptions }: Props) {
  const toastHost = useToastHostNeeded()
  const defaultOptions = toastOptions?.defaultOptions
  return (
    <ThemeProvider theme={theme}>
      <ColorModeProvider colorModeManager={colorModeManager} options={theme.config}>
        <CSSReset />
        <GlobalStyle />
        <EnvironmentProvider>
          <ToastOptionProvider value={defaultOptions}>{children}</ToastOptionProvider>
          {toastHost ? <ToastHost /> : null}
        </EnvironmentProvider>
      </ColorModeProvider>
    </ThemeProvider>
  )
}
