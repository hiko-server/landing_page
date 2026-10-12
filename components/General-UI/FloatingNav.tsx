import React, { useEffect, useState } from 'react'
import { Box, Flex, Tooltip, useColorModeValue } from '@chakra-ui/react'
import { motion, AnimatePresence } from 'framer-motion'

/**
 * Right-edge section navigator for long pages (desktop only).
 *
 * Sections opt in with `data-nav-label="…"` + an `id`, so the dots always
 * match what is actually rendered (hidden sections simply don't register).
 * The active dot is tracked with an IntersectionObserver — no scroll-handler
 * layout reads on every frame.
 */
type Target = { id: string; label: string }

export default function FloatingNav() {
  const [targets, setTargets] = useState<Target[]>([])
  const [active, setActive] = useState<string | null>(null)
  const [visible, setVisible] = useState(false)

  const navBg = useColorModeValue('rgba(255,255,255,0.82)', 'rgba(15,15,15,0.82)')
  const navBorder = useColorModeValue('rgba(0,0,0,0.08)', 'rgba(255,255,255,0.10)')
  const dotIdle = useColorModeValue('rgba(0,0,0,0.18)', 'rgba(255,255,255,0.22)')

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
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    el.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' })
    el.focus({ preventScroll: true })
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
          <motion.nav
            aria-label="Page sections"
            initial={{ opacity: 0, x: 16 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 16 }}
            transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
          >
            <Flex
              as="ul"
              listStyleType="none"
              direction="column"
              gap={1}
              bg={navBg}
              border="1px solid"
              borderColor={navBorder}
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
                    <Tooltip label={t.label} placement="left" hasArrow openDelay={150}>
                      <Box
                        as="button"
                        type="button"
                        aria-label={`Jump to ${t.label}`}
                        aria-current={on ? 'true' : undefined}
                        onClick={() => go(t.id)}
                        display="grid"
                        placeItems="center"
                        w="22px"
                        h="22px"
                        borderRadius="full"
                        _focusVisible={{ outline: '2px solid var(--accent)', outlineOffset: '1px' }}
                      >
                        <Box
                          as="span"
                          w={on ? '8px' : '6px'}
                          h={on ? '8px' : '6px'}
                          borderRadius="full"
                          bg={on ? 'var(--accent)' : dotIdle}
                          boxShadow={on ? '0 0 0 3px var(--accent-soft)' : undefined}
                          transition="all 200ms var(--ease-out-quart)"
                        />
                      </Box>
                    </Tooltip>
                  </Box>
                )
              })}
            </Flex>
          </motion.nav>
        )}
      </AnimatePresence>
    </Box>
  )
}
