import React, { useEffect, useState } from 'react'
import { Box, Flex, Tooltip, useColorModeValue } from '@chakra-ui/react'
import { motion, AnimatePresence } from 'framer-motion'

const SECTIONS = [
  { id: 'section-github', label: '🐙 GitHub', icon: '🐙' },
  { id: 'section-tech', label: '⚙️ Tech Stack', icon: '⚙️' },
  { id: 'section-activity', label: '📈 Activity', icon: '📈' },
  { id: 'section-projects', label: '🚀 Projects', icon: '🚀' },
  { id: 'section-experience', label: '💼 Experience', icon: '💼' },
  { id: 'section-certs', label: '🏅 Certs', icon: '🏅' },
]

export default function FloatingNav() {
  const [visible, setVisible] = useState(false)
  const [active, setActive] = useState<string | null>(null)

  const navBg = useColorModeValue('rgba(255,255,255,0.82)', 'rgba(15,17,23,0.82)')
  const navBorder = useColorModeValue('rgba(0,0,0,0.08)', 'rgba(255,255,255,0.1)')
  const dotDefault = useColorModeValue('rgba(0,0,0,0.15)', 'rgba(255,255,255,0.2)')
  const dotActive = 'linear-gradient(135deg,#dd6b20,#f59e0b)'

  useEffect(() => {
    const onScroll = () => {
      setVisible(window.scrollY > 320)

      // Find active section
      let found: string | null = null
      for (const s of SECTIONS) {
        const el = document.getElementById(s.id)
        if (el) {
          const rect = el.getBoundingClientRect()
          if (rect.top <= 160) found = s.id
        }
      }
      setActive(found)
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  const scrollTo = (id: string) => {
    const el = document.getElementById(id)
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  return (
    <AnimatePresence>
      {visible && (
        <Box
          as={motion.div}
          initial={{ opacity: 0, x: 24 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: 24 }}
          transition={{ duration: 0.3 } as any}
          position="fixed"
          right={{ base: 3, md: 5 }}
          top="50%"
          transform="translateY(-50%)"
          zIndex={1000}
        >
          <Flex
            direction="column"
            gap={2}
            bg={navBg}
            border="1px solid"
            borderColor={navBorder}
            borderRadius="full"
            py={3}
            px={2}
            backdropFilter="blur(16px)"
            boxShadow="0 8px 32px rgba(0,0,0,0.15)"
            align="center"
          >
            {SECTIONS.map((s) => (
              <Tooltip key={s.id} label={s.label} placement="left" hasArrow>
                <Box
                  as={motion.div as any}
                  w="10px"
                  h="10px"
                  borderRadius="full"
                  bgImage={active === s.id ? dotActive : undefined}
                  bg={active === s.id ? undefined : dotDefault}
                  cursor="pointer"
                  whileHover={{ scale: 1.5 }}
                  transition={{ duration: 0.15 } as any}
                  onClick={() => scrollTo(s.id)}
                  sx={active === s.id ? { boxShadow: '0 0 0 3px rgba(221,107,32,0.25)' } : {}}
                />
              </Tooltip>
            ))}
          </Flex>
        </Box>
      )}
    </AnimatePresence>
  )
}
