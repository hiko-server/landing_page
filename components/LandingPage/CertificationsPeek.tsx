import React, { useMemo } from 'react'
import { Box, Flex, Link, Text, useColorModeValue } from '@chakra-ui/react'
import { motion } from 'framer-motion'

type CertOrg = {
  issuingOrganization: string
  CertificationList: { certificationName: string; credentialURL: string }[]
}

/**
 * v6 Certifications.
 *
 * Replaces v5's teal-tinted glass chips with org-grouped chip rows on a flat
 * surface. Org name uses monospace label style; chips use a subtle border.
 * Accent appears only on hover for external-link arrows.
 */

export default function CertificationsPeek({ cvEn }: { cvEn?: any[] }) {
  const border = useColorModeValue('rgba(0,0,0,0.08)', 'rgba(255,255,255,0.10)')
  const borderHover = useColorModeValue('rgba(0,0,0,0.20)', 'rgba(255,255,255,0.24)')
  const fg = useColorModeValue('gray.700', 'gray.300')
  const dim = useColorModeValue('gray.500', 'gray.500')
  const monoFont = 'var(--font-geist-mono), monospace'

  const orgs: CertOrg[] = useMemo(() => {
    if (!Array.isArray(cvEn)) return []
    const section = cvEn.find((s: any) => s.sessionName === 'certification')
    if (!section?.certifications) return []
    return section.certifications
      .filter((org: any) => org?.CertificationList?.length > 0)
      .slice(0, 4)
  }, [cvEn])

  if (!orgs.length) return null

  return (
    <Box w="100%" maxW="900px">
      {orgs.map((org, oi) => (
        <Box
          as={motion.div as any}
          key={oi}
          initial={{ opacity: 0, y: 8 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.3, delay: oi * 0.08 } as any}
          mb={6}
        >
          <Text
            fontFamily={monoFont}
            fontSize="10px"
            letterSpacing="0.16em"
            textTransform="uppercase"
            color={dim}
            mb={3}
          >
            ▸ {org.issuingOrganization}
          </Text>
          <Flex wrap="wrap" gap={2}>
            {(org.CertificationList || []).slice(0, 8).map((c, ci) => {
              const isLink = !!c.credentialURL
              return (
                <Link
                  key={ci}
                  href={c.credentialURL || '#'}
                  isExternal={isLink}
                  _hover={{ textDecoration: 'none' }}
                  border="1px solid"
                  borderColor={border}
                  borderRadius="md"
                  px={3}
                  py={1.5}
                  fontSize="12px"
                  color={fg}
                  display="inline-flex"
                  alignItems="center"
                  gap={1.5}
                  transition="border-color 200ms var(--ease-out-quart), color 200ms var(--ease-out-quart)"
                  sx={{
                    '&:hover': isLink
                      ? { borderColor: borderHover, color: 'var(--accent)' }
                      : {},
                  }}
                >
                  {c.certificationName}
                  {isLink && (
                    <Text as="span" fontFamily={monoFont} fontSize="9px" opacity={0.6}>
                      ↗
                    </Text>
                  )}
                </Link>
              )
            })}
          </Flex>
        </Box>
      ))}
    </Box>
  )
}
