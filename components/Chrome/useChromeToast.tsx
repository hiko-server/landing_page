import { useMemo } from 'react'
import { Box, Toast, useToast, type UseToastOptions } from '@chakra-ui/react'
import { useChromeLang } from './chromeLang'

/**
 * Toasts raised by the chrome (header, ⌘K palette), in the chrome's
 * language (./chromeLang.ts). Toasts render in Chakra's portal at the end of
 * <body>, outside the chrome's subtree, so where the chrome's words are not
 * in the document's language (English chrome on a Japanese post) each one is
 * wrapped in its own `lang` box. Page toasts written in the page's own
 * language keep using useToast and inherit <html lang>.
 */
export function useChromeToast() {
  const lang = useChromeLang()
  const options = useMemo<UseToastOptions | undefined>(
    () =>
      lang
        ? {
            render: (props) => (
              <Box lang={lang}>
                <Toast {...props} />
              </Box>
            ),
          }
        : undefined,
    [lang],
  )
  return useToast(options)
}
