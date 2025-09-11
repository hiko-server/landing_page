import React, { useMemo } from 'react'
import { Box, Flex, Heading, Link, Tag, TagLabel, useColorModeValue } from '@chakra-ui/react'

type CertItem = { certificationName: string; credentialURL: string }

export default function CertificationsPeek({ cvEn }: { cvEn?: any[] }) {
  const items: CertItem[] = useMemo(() => {
    if (!Array.isArray(cvEn)) return []
    const section = cvEn.find((s: any) => s.sessionName === 'certification')
    const list: CertItem[] = []
    if (section?.certifications) {
      for (const org of section.certifications) {
        for (const c of org.CertificationList || []) {
          if (c?.certificationName) list.push({ certificationName: c.certificationName, credentialURL: c.credentialURL })
        }
      }
    }
    return list.slice(0, 8)
  }, [cvEn])
  const color = useColorModeValue('blue','purple')
  if (!items.length) return null
  return (
    <Box w="100%" maxW="1100px">
      <Heading as="h3" size="md" mb={2}>Certifications</Heading>
      <Flex wrap="wrap" gap={2}>
        {items.map((it, i) => (
          <Link key={i} href={it.credentialURL} isExternal>
            <Tag colorScheme={color} variant="subtle" size="md"><TagLabel>{it.certificationName}</TagLabel></Tag>
          </Link>
        ))}
      </Flex>
    </Box>
  )
}
