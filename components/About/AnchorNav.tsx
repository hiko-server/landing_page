import React, { useEffect, useState } from 'react'
import { HStack, Button, Box, useColorModeValue } from '@chakra-ui/react'
import { motion } from 'framer-motion'

type Anchor = { id: string; label: string }

export default function AnchorNav({ anchors }: { anchors: Anchor[] }) {
  const [active, setActive] = useState(anchors[0]?.id)
  // const indicator = useColorModeValue('blue.600', 'blue.300')
  useEffect(() => {
    const obs = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) setActive(e.target.id)
        })
      },
      { rootMargin: '-40% 0px -55% 0px', threshold: [0, 0.25, 0.5, 0.75, 1] }
    )
    anchors.forEach((a) => {
      const el = document.getElementById(a.id)
      if (el) obs.observe(el)
    })
    return () => obs.disconnect()
  }, [anchors])

  return (
    <Box
      position="sticky"
      top="64px"
      zIndex={10}
      bg={useColorModeValue('white', 'gray.900')}
      py={2}
    >
      <HStack spacing={2} overflowX="auto" px={2}>
        {anchors.map((a) => (
          <Button
            key={a.id}
            size="sm"
            variant={active === a.id ? 'solid' : 'outline'}
            colorScheme="blue"
            onClick={() =>
              document
                .getElementById(a.id)
                ?.scrollIntoView({ behavior: 'smooth', block: 'start' })
            }
            as={motion.button}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
          >
            {a.label}
          </Button>
        ))}
      </HStack>
    </Box>
  )
}
