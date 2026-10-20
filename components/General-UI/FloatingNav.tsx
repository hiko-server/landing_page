import { useEffect, useState } from 'react'
import { Box, Flex } from '@chakra-ui/react'
import { m, AnimatePresence } from 'framer-motion'

import Hint, { HintGroup } from './Hint'
import { cssTransition, motionTransition } from '../../theme/tokens'
import { fillUi } from '../../lib/uiStrings'

/**
 * Right-edge section navigator for long pages (desktop only).
 *
 * Sections opt in with `data-nav-label="…"` + an `id`, so the dots always
 * match what is actually rendered (hidden sections simply don't register).
 * The active dot is tracked with an IntersectionObserver — no scroll-handler
 * layout reads on every frame. A section whose content is still deferred
 * (components/Common/WhenVisible) is mounted first, via the URL hash, so the
 * jump lands where the section really ends up. Its words are the page's
 * (`label`, `jumpTo` with {label}; English by default).
 */
type Target = { id: string; label: string }

export default function FloatingNav({ label = 'Page sections', jumpTo = 'Jump to {label}' }: { label?: string; jumpTo?: string }) {
  const [targets, setTargets] = useState<Target[]>([])
  const [active, setActive] = useState<string | null>(null)
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const els = Array.from(document.querySelectorAll<HTMLElement>('[data-nav-label][id]'))
    setTargets(els.map((el) => ({ id: el.id, label: el.dataset.navLabel || el.id })))
    if (!els.length) return

    const io = new IntersectionObserver(
      (entries) => {
        const hit = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0]
        if (hit) setActive(hit.target.id)
      },
      // A section is "current" while it crosses the upper-middle band of the viewport.
      { rootMargin: '-30% 0px -55% 0px', threshold: 0 },
    )
    els.forEach((el) => io.observe(el))

    const onScroll = () => setVisible(window.scrollY > 480)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      io.disconnect()
      window.removeEventListener('scroll', onScroll)
    }
  }, [])

  if (targets.length < 2) return null

  const go = (id: string) => {
    const el = document.getElementById(id)
    if (!el) return
    const jump = () => {
      const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
      el.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' })
      // Move keyboard / screen-reader focus with the jump (sections are not
      // focusable by default).
      if (!el.hasAttribute('tabindex')) el.setAttribute('tabindex', '-1')
      el.focus({ preventScroll: true })
    }
    if (el.querySelector('[data-when-visible="pending"]')) {
      // Deferred content: point the hash at the section (keeping Next's
      // history state) so WhenVisible mounts it, then scroll once it has laid out.
      const oldURL = window.location.href
      window.history.replaceState(window.history.state, '', `#${encodeURIComponent(id)}`)
      window.dispatchEvent(new HashChangeEvent('hashchange', { oldURL, newURL: window.location.href }))
      requestAnimationFrame(() => requestAnimationFrame(jump))
      return
    }
    jump()
  }

  return (
    <Box
      position="fixed"
      right={5}
      top="50%"
      zIndex={30}
      display={{ base: 'none', xl: 'block' }}
      style={{ transform: 'translateY(-50%)' }}
      className="no-print"
    >
      <AnimatePresence>
        {visible && (
          <m.nav
            aria-label={label}
            initial={{ opacity: 0, x: 16 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 16 }}
            transition={motionTransition('base')}
          >
            <HintGroup>
              <Flex
                as="ul"
                className="glass"
                listStyleType="none"
                direction="column"
                gap={1}
                bg="page.float-bg"
                border="1px solid"
                borderColor="page.border"
                borderRadius="full"
                py={2}
                px={1}
                backdropFilter="blur(14px)"
                boxShadow="0 8px 28px rgba(0,0,0,0.12)"
                align="center"
              >
                {targets.map((t) => {
                  const on = active === t.id
                  return (
                    <Box as="li" key={t.id}>
                      <Hint label={t.label} placement="left">
                        <Box
                          as="button"
                          type="button"
                          aria-label={fillUi(jumpTo, { label: t.label })}
                          aria-current={on ? 'true' : undefined}
                          onClick={() => go(t.id)}
                          display="grid"
                          placeItems="center"
                          w="24px"
                          h="24px"
                          borderRadius="full"
                          _focusVisible={{ outline: '2px solid var(--accent)', outlineOffset: '1px' }}
                        >
                          <Box
                            as="span"
                            w="8px"
                            h="8px"
                            borderRadius="full"
                            bg={on ? 'var(--accent)' : 'page.dot-idle'}
                            boxShadow={on ? '0 0 0 3px var(--accent-soft)' : '0 0 0 0 transparent'}
                            transform={on ? 'scale(1)' : 'scale(0.75)'}
                            transition={cssTransition(['transform', 'box-shadow', 'background-color'], 'fast')}
                            sx={{ '@media (forced-colors: active)': { bg: on ? 'Highlight' : 'CanvasText' } }}
                          />
                        </Box>
                      </Hint>
                    </Box>
                  )
                })}
              </Flex>
            </HintGroup>
          </m.nav>
        )}
      </AnimatePresence>
    </Box>
  )
}
