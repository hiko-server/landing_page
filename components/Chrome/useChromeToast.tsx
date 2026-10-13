import React from 'react'
import { Box, Toast, useToast, type UseToastOptions } from '@chakra-ui/react'
import { CHROME_LANG, useChromeLang } from './chromeLang'

/**
 * Toasts raised by the English chrome (header, ⌘K palette). Toasts render in
 * Chakra's portal at the end of <body>, outside the chrome's lang="en"
 * subtree, so on a non-English page each one is wrapped in its own
 * lang="en" box (./chromeLang.ts). Page toasts written in the page's own
 * language (the /cv/zh "链接已复制") keep using useToast and inherit
 * <html lang>.
 */
const ENGLISH_TOAST: UseToastOptions = {
  render: (props) => (
    <Box lang={CHROME_LANG}>
      <Toast {...props} />
    </Box>
  ),
}

export function useChromeToast() {
  return useToast(useChromeLang() ? ENGLISH_TOAST : undefined)
}
