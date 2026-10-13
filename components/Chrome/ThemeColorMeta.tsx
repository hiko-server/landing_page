import { useEffect } from 'react'
import { syncThemeColorMeta } from './themeColor'

/**
 * Keeps the single `<meta name="theme-color">` (rendered by pages/_document,
 * corrected before first paint) in step with the colour mode on screen after
 * hydration — the theme toggle rewrites `data-theme`, this follows it.
 * See ./themeColor.ts.
 */
export default function ThemeColorMeta() {
  useEffect(() => syncThemeColorMeta(document, MutationObserver), [])
  return null
}
