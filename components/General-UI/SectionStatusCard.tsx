import { Box, Button, HStack, Text, useColorModeValue } from '@chakra-ui/react'

export default function SectionStatusCard({
  title,
  description,
  actionLabel,
  onAction,
}: {
  title: string
  description: string
  actionLabel?: string
  onAction?: () => void
}) {
  const bg = useColorModeValue('whiteAlpha.900', 'blackAlpha.350')
  const borderColor = useColorModeValue('blackAlpha.100', 'whiteAlpha.200')
  const titleColor = useColorModeValue('gray.800', 'whiteAlpha.900')
  const textColor = useColorModeValue('gray.600', 'gray.300')

  return (
    <Box
      w="100%"
      p={4}
      borderWidth="1px"
      borderColor={borderColor}
      borderRadius="2xl"
      bg={bg}
    >
      <Text fontWeight="semibold" color={titleColor} mb={1}>
        {title}
      </Text>
      <Text color={textColor} fontSize="sm">
        {description}
      </Text>
      {actionLabel && onAction ? (
        <HStack mt={4}>
          <Button size="sm" colorScheme="teal" variant="outline" onClick={onAction}>
            {actionLabel}
          </Button>
        </HStack>
      ) : null}
    </Box>
  )
}
