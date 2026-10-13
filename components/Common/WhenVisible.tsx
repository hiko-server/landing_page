import React, { useEffect, useRef, useState } from 'react'
import { Box } from '@chakra-ui/react'

/**
 * Defers mounting below-the-fold widgets (and downloading their code-split
 * chunks) until they are about to scroll into view.
 *
 * Until then it renders an empty box of `minHeight`, so the page keeps its
 * final height and nothing shifts when the children arrive. Children mount
 * immediately when:
 *   - `eager` is set,
 *   - IntersectionObserver is unavailable,
 *   - the URL hash targets an element inside the placeholder (e.g. a
 *     `#section-contact` deep link or the floating section nav), or
 *   - the box comes within `rootMargin` of the viewport.
 *
 * The server renders the placeholder; hydration matches it (the decision is
 * made in an effect), then the children mount on the client.
 */
export default function WhenVisible({
  minHeight,
  rootMargin = '600px 0px',
  eager = false,
  children,
}: {
  minHeight: number | string | Record<string, number | string>
  rootMargin?: string
  eager?: boolean
  children: React.ReactNode
}) {
  const ref = useRef<HTMLDivElement | null>(null)
  const [show, setShow] = useState(eager)

  useEffect(() => {
    if (show) return
    const el = ref.current
    if (!el) return

    const hashTargetsInside = () => {
      const id = decodeHash(window.location.hash)
      if (!id) return false
      const target = document.getElementById(id)
      return Boolean(target && (target === el || el.contains(target) || target.contains(el)))
    }

    if (eager || typeof IntersectionObserver === 'undefined' || hashTargetsInside()) {
      setShow(true)
      return
    }

    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) setShow(true)
      },
      { rootMargin },
    )
    io.observe(el)
    const onHash = () => {
      if (hashTargetsInside()) setShow(true)
    }
    window.addEventListener('hashchange', onHash)
    return () => {
      io.disconnect()
      window.removeEventListener('hashchange', onHash)
    }
  }, [show, eager, rootMargin])

  return (
    <Box ref={ref} minH={show ? undefined : minHeight} data-when-visible={show ? 'mounted' : 'pending'}>
      {show ? children : null}
    </Box>
  )
}

function decodeHash(hash: string): string {
  const raw = hash.replace(/^#/, '')
  if (!raw) return ''
  try {
    return decodeURIComponent(raw)
  } catch {
    return raw
  }
}
