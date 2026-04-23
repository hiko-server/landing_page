import { Box, Heading, Text, useColorModeValue } from '@chakra-ui/react'
import { motion } from 'framer-motion'

export default function AboutHero({ brand, tagline }: { brand?: string; tagline?: string }) {
  const accent = useColorModeValue(
    'linear-gradient(90deg,#2563eb,#06b6d4,#16a34a)',
    'linear-gradient(90deg,#93c5fd,#5eead4,#86efac)'
  )
  if (!brand && !tagline) return null

  return (
    <Box textAlign="center" mb={6} as={motion.div} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
      {brand && (
        <Heading
          as={motion.h1}
          fontSize={{ base: '3xl', md: '5xl' }}
          fontWeight="extrabold"
          bgImage={accent}
          bgClip="text"
          mb={2}
        >
          {brand}
        </Heading>
      )}
      {tagline && (
        <Text fontSize={{ base: 'md', md: 'xl' }} opacity={0.9}>{tagline}</Text>
      )}
    </Box>
  )
}
