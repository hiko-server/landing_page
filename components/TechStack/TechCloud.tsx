import React, { useEffect, useState } from 'react'
import { Box, Flex, Skeleton, Text, useColorModeValue } from '@chakra-ui/react'
import { motion } from 'framer-motion'

type Item = { name: string; version?: string }
type Group = { label: string; items: Item[] }

const monoFont = 'var(--font-geist-mono), ui-monospace, monospace'

/**
 * The site's own stack, grouped (Framework / Interface / Content / Data /
 * Platform / Infrastructure). Data comes from /api/stack, which derives it
 * from package.json so it never goes stale.
 */
export default function TechCloud() {
  const [groups, setGroups] = useState<Group[] | null>(null)
  const border = useColorModeValue('rgba(0,0,0,0.08)', 'rgba(255,255,255,0.10)')
  const borderHover = useColorModeValue('rgba(0,0,0,0.22)', 'rgba(255,255,255,0.26)')
  const label = useColorModeValue('gray.600', 'gray.500')
  const fg = useColorModeValue('gray.800', 'gray.100')
  const ver = useColorModeValue('gray.500', 'gray.500')

  useEffect(() => {
    let alive = true
    fetch('/api/stack')
      .then((r) => r.json())
      .then((d) => alive && setGroups(Array.isArray(d.groups) ? d.groups : []))
      .catch(() => alive && setGroups([]))
    return () => {
      alive = false
    }
  }, [])

  if (groups && !groups.length) return null

  return (
    <Box w="100%" maxW="1100px" mx="auto" minH={groups ? undefined : '220px'}>
      {!groups
        ? Array.from({ length: 4 }, (_, i) => <Skeleton key={i} h="28px" mb={4} borderRadius="md" opacity={0.4} />)
        : groups.map((g, gi) => (
            <Flex
              key={g.label}
              direction={{ base: 'column', sm: 'row' }}
              align={{ base: 'flex-start', sm: 'baseline' }}
              gap={{ base: 2, sm: 6 }}
              py={3}
              borderTop={gi === 0 ? undefined : '1px solid'}
              borderColor={border}
            >
              <Text
                fontFamily={monoFont}
                fontSize="10px"
                letterSpacing="0.14em"
                textTransform="uppercase"
                color={label}
                w={{ sm: '120px' }}
                flexShrink={0}
              >
                {g.label}
              </Text>
              <Flex wrap="wrap" gap={2}>
                {g.items.map((it, i) => (
                  <Box
                    as={motion.span as any}
                    key={it.name}
                    initial={{ opacity: 0, y: 6 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true, margin: '-40px' }}
                    transition={{ duration: 0.3, delay: gi * 0.04 + i * 0.03, ease: [0.22, 1, 0.36, 1] } as any}
                    display="inline-flex"
                    alignItems="baseline"
                    gap={1.5}
                    px={2.5}
                    py={1}
                    border="1px solid"
                    borderColor={border}
                    borderRadius="md"
                    fontSize="13px"
                    color={fg}
                    _hover={{ borderColor: borderHover }}
                    sx={{ transitionProperty: 'border-color', transitionDuration: '160ms' }}
                  >
                    {it.name}
                    {it.version ? (
                      <Text as="span" fontFamily={monoFont} fontSize="10px" color={ver}>
                        {it.version}
                      </Text>
                    ) : null}
                  </Box>
                ))}
              </Flex>
            </Flex>
          ))}
    </Box>
  )
}
