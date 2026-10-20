import { useEffect } from 'react'
import { goalsAllowed, sendGoal } from './goalBeacon'

/**
 * read_through (H9): one event when a reader has actually reached the end
 * of a post or case study. Loaded with the article page chunk, never in the
 * shared bundle.
 *
 * Counted once per page view, when all of these hold:
 *   - the end marker after the body (#article-end) is in the viewport
 *     (IntersectionObserver), and it was NOT already visible when the page
 *     opened — the reader scrolled to it — unless the whole article fits on
 *     the screen;
 *   - the page has been visible (a foreground tab) for at least the
 *     article's minimum reading time: its word count at a brisk 1,000 words
 *     a minute, never under 10 s or over 90 s. A fast skim to the bottom is
 *     not a read.
 * The server records only the page path.
 */

export const MIN_READ_MS = 10_000
export const MAX_READ_MS = 90_000
const WORDS_PER_MINUTE = 1000

/** The minimum visible time for an article of `words` words. */
export function minReadMs(words: number): number {
  const ms = Math.round((Math.max(0, words) / WORDS_PER_MINUTE) * 60_000)
  return Math.min(MAX_READ_MS, Math.max(MIN_READ_MS, ms))
}

/** Words in the text: whitespace-separated runs, each CJK character counting as one word. */
export function countWords(text: string): number {
  const cjk = (text.match(/[㐀-鿿豈-﫿぀-ヿ가-힯]/g) || []).length
  const latin = text.replace(/[㐀-鿿豈-﫿぀-ヿ가-힯]/g, ' ').split(/\s+/).filter(Boolean).length
  return cjk + latin
}

/** Watch #article-end (or `endId`) and send read_through once when the rules above are met. */
export function useReadThrough(endId = 'article-end', bodyId = 'article-body'): void {
  useEffect(() => {
    const end = document.getElementById(endId)
    if (!end || typeof IntersectionObserver === 'undefined' || !goalsAllowed()) return
    const needMs = minReadMs(countWords(document.getElementById(bodyId)?.textContent || ''))

    let visibleMs = 0
    let visibleSince = document.visibilityState === 'visible' ? performance.now() : null
    let atEnd = false
    let scrolled = false
    let first = true
    let done = false
    let timer: ReturnType<typeof setTimeout> | null = null

    const elapsed = () => visibleMs + (visibleSince === null ? 0 : performance.now() - visibleSince)
    const stop = () => {
      done = true
      observer.disconnect()
      document.removeEventListener('visibilitychange', onVisibility)
      if (timer) clearTimeout(timer)
    }
    const check = () => {
      if (timer) clearTimeout(timer)
      timer = null
      if (done || !atEnd || !scrolled || visibleSince === null) return
      const left = needMs - elapsed()
      if (left > 0) {
        timer = setTimeout(check, left + 50)
        return
      }
      stop()
      sendGoal('read_through')
    }
    const onVisibility = () => {
      if (document.visibilityState === 'visible') visibleSince ??= performance.now()
      else if (visibleSince !== null) {
        visibleMs += performance.now() - visibleSince
        visibleSince = null
      }
      check()
    }
    const observer = new IntersectionObserver((entries) => {
      const entry = entries[entries.length - 1]
      if (first) {
        first = false
        // Already in view on arrival: only a page shorter than the screen counts without scrolling.
        scrolled = !entry.isIntersecting || document.documentElement.scrollHeight <= window.innerHeight + 1
      } else if (!entry.isIntersecting) {
        scrolled = true
      }
      atEnd = entry.isIntersecting
      check()
    })
    observer.observe(end)
    document.addEventListener('visibilitychange', onVisibility)
    return stop
  }, [endId, bodyId])
}
