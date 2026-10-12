import React, { useEffect, useState } from 'react'
import { IconButton } from '@chakra-ui/react'
import { ChevronUpIcon } from '@chakra-ui/icons'

/** Show the button once the visitor is this far down the page (px). */
const SHOW_AFTER = 400

/**
 * Floating "back to top" control (all routes).
 *
 * - Smooth scroll, or an instant jump under prefers-reduced-motion.
 * - Focus moves to the top of the page (the <main> landmark when present) so
 *   keyboard and screen-reader users land where the viewport did, instead of
 *   on a button that has just disappeared.
 * - Scroll position is sampled at most once per frame.
 */
const ScrollToTop: React.FC = () => {
  const [isVisible, setIsVisible] = useState(false)

  useEffect(() => {
    let frame = 0
    const update = () => {
      frame = 0
      setIsVisible(window.scrollY > SHOW_AFTER)
    }
    const onScroll = () => {
      if (!frame) frame = window.requestAnimationFrame(update)
    }
    update()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      window.removeEventListener('scroll', onScroll)
      if (frame) window.cancelAnimationFrame(frame)
    }
  }, [])

  const scrollToTop = () => {
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    window.scrollTo({ top: 0, behavior: reduce ? 'auto' : 'smooth' })
    const target = document.getElementById('main') || document.body
    target.focus({ preventScroll: true })
  }

  return (
    <IconButton
      icon={<ChevronUpIcon boxSize={5} />}
      onClick={scrollToTop}
      position="fixed"
      bottom="calc(24px + env(safe-area-inset-bottom, 0px))"
      right="calc(16px + env(safe-area-inset-right, 0px))"
      zIndex={30}
      size="md"
      variant="outline"
      borderRadius="full"
      bg="page.float-bg"
      backdropFilter="blur(14px)"
      borderColor="page.border"
      color="page.fg-secondary"
      boxShadow="0 8px 28px rgba(0,0,0,0.12)"
      _hover={{ color: 'page.fg', borderColor: 'page.border-strong', bg: 'page.float-bg' }}
      _focusVisible={{ outline: '2px solid var(--accent)', outlineOffset: '2px' }}
      className="no-print"
      aria-label="Scroll to top"
      title="Scroll to top"
      display={isVisible ? 'inline-flex' : 'none'}
    />
  )
}

export default ScrollToTop
