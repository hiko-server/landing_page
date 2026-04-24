import React, { useEffect, useState } from 'react'
import { Box, Wrap, WrapItem, Text, useColorModeValue } from '@chakra-ui/react'
import { motion } from 'framer-motion'

// Assign a gradient based on first char for color variety
const GRADIENTS = [
  'linear-gradient(135deg,#dd6b20,#f59e0b)',
  'linear-gradient(135deg,#0f766e,#14b8a6)',
  'linear-gradient(135deg,#7c3aed,#a78bfa)',
  'linear-gradient(135deg,#2563eb,#60a5fa)',
  'linear-gradient(135deg,#dc2626,#f87171)',
  'linear-gradient(135deg,#059669,#34d399)',
  'linear-gradient(135deg,#b45309,#fbbf24)',
  'linear-gradient(135deg,#6d28d9,#c4b5fd)',
]

function tagGradient(name: string): string {
  let hash = 0
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) >>> 0
  return GRADIENTS[hash % GRADIENTS.length]
}

export default function TechCloud() {
  const [packages, setPackages] = useState<string[] | null>(null)
  const tagBg = useColorModeValue('rgba(255,255,255,0.7)', 'rgba(30,41,59,0.6)')
  const tagBorder = useColorModeValue('rgba(0,0,0,0.07)', 'rgba(255,255,255,0.1)')
  const textColor = useColorModeValue('gray.800', 'gray.100')

  useEffect(() => {
    let alive = true
    fetch('/api/stack')
      .then(r => r.json())
      .then(d => { if (alive) setPackages(d.packages || []) })
      .catch(() => { if (alive) setPackages([]) })
    return () => { alive = false }
  }, [])

  if (!packages || !packages.length) return null

  return (
    <Wrap spacing={2} justify="center">
      {packages.map((name, i) => (
        <WrapItem key={name}>
          <Box
            as={motion.div as any}
            initial={{ opacity: 0, scale: 0.85 }}
            whileInView={{ opacity: 1, scale: 1 }}
            viewport={{ once: true }}
            transition={{ duration: 0.25, delay: (i % 20) * 0.03 } as any}
            whileHover={{ scale: 1.08, y: -2 } as any}
            bg={tagBg}
            border="1px solid"
            borderColor={tagBorder}
            borderRadius="full"
            px={3}
            py={1}
            backdropFilter="blur(6px)"
            position="relative"
            overflow="hidden"
            sx={{ transition: 'all 0.18s ease' }}
          >
            {/* Gradient left accent */}
            <Box
              position="absolute"
              left={0}
              top={0}
              bottom={0}
              w="3px"
              bgImage={tagGradient(name)}
            />
            <Text fontSize="sm" fontWeight="600" color={textColor} pl={1}>
              {name}
            </Text>
          </Box>
        </WrapItem>
      ))}
    </Wrap>
  )
}

