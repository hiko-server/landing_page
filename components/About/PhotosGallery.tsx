import React from 'react'
import { Box, Image, SimpleGrid, useColorModeValue } from '@chakra-ui/react'

type Photo = { url: string; describe?: string; redirectTo?: string; visible?: boolean }

export default function PhotosGallery({ photos }: { photos?: Photo[] }) {
  const data = (photos || []).filter((p) => p.visible !== false)
  if (!data.length) return null
  const bg = useColorModeValue('white','gray.800')
  const border = useColorModeValue('gray.200','gray.700')
  return (
    <SimpleGrid columns={{ base: 1, sm: 2, md: 3 }} spacing={3} w="100%" maxW="1000px">
      {data.map((p, i) => (
        <Box key={i} borderWidth="1px" borderColor={border} borderRadius="md" overflow="hidden" bg={bg} onClick={()=> p.redirectTo && window.open(p.redirectTo, '_blank')} cursor={p.redirectTo ? 'pointer' : 'default'}>
          <Image src={p.url} alt={p.describe || 'photo'} w="100%" h={{ base: '180px', md: '200px' }} objectFit="cover" />
        </Box>
      ))}
    </SimpleGrid>
  )
}

