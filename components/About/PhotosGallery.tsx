import {
  Badge,
  Box,
  HStack,
  Image,
  SimpleGrid,
  Text,
  useColorModeValue,
} from '@chakra-ui/react'
import { ExternalLinkIcon } from '@chakra-ui/icons'
import { motion } from 'framer-motion'

type Photo = { url: string; describe?: string; redirectTo?: string; visible?: boolean }

const MotionBox = motion(Box)

export default function PhotosGallery({ photos }: { photos?: Photo[] }) {
  const data = (photos || []).filter((photo) => photo.visible !== false)
  const cardBg = useColorModeValue('white', 'gray.800')
  const border = useColorModeValue('gray.200', 'gray.700')
  const mutedText = useColorModeValue('gray.600', 'gray.300')
  const badgeBg = useColorModeValue('teal.50', 'teal.900')
  const badgeColor = useColorModeValue('teal.700', 'teal.100')

  if (!data.length) return null

  return (
    <SimpleGrid columns={{ base: 1, sm: 2, md: 3 }} spacing={4} w="100%" maxW="1100px">
      {data.map((photo, index) => {
        const cardContent = (
          <>
            <Box overflow="hidden">
              <Image
                src={photo.url}
                alt={photo.describe || 'photo'}
                w="100%"
                h={{ base: '220px', md: '210px' }}
                objectFit="cover"
                transition="transform 0.35s ease"
                _groupHover={{ transform: 'scale(1.04)' }}
              />
            </Box>
            <Box p={4}>
              <Text fontWeight="semibold" mb={2}>
                {photo.describe || `Photo ${index + 1}`}
              </Text>
              <HStack justifyContent="space-between" alignItems="center" flexWrap="wrap" spacing={3}>
                <Text fontSize="sm" color={mutedText}>
                  Events, demos, and project moments from Hiko’s work.
                </Text>
                {photo.redirectTo ? (
                  <Badge
                    display="inline-flex"
                    alignItems="center"
                    gap={1}
                    px={3}
                    py={1}
                    borderRadius="full"
                    bg={badgeBg}
                    color={badgeColor}
                  >
                    Open link
                    <ExternalLinkIcon />
                  </Badge>
                ) : null}
              </HStack>
            </Box>
          </>
        )

        if (!photo.redirectTo) {
          return (
            <MotionBox
              key={`${photo.url}-${index}`}
              borderWidth="1px"
              borderColor={border}
              borderRadius="2xl"
              overflow="hidden"
              bg={cardBg}
              whileHover={{ y: -4 }}
            >
              {cardContent}
            </MotionBox>
          )
        }

        return (
          <MotionBox
            key={`${photo.url}-${index}`}
            as="a"
            href={photo.redirectTo}
            target="_blank"
            rel="noopener noreferrer"
            borderWidth="1px"
            borderColor={border}
            borderRadius="2xl"
            overflow="hidden"
            bg={cardBg}
            whileHover={{ y: -4 }}
            transition="box-shadow 0.25s ease"
            _hover={{ boxShadow: 'xl' }}
            role="group"
          >
            {cardContent}
          </MotionBox>
        )
      })}
    </SimpleGrid>
  )
}
