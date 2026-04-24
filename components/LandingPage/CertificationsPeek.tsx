import React, { useMemo } from 'react'
import { Box, Flex, Link, Text, useColorModeValue } from '@chakra-ui/react'
import { motion } from 'framer-motion'
import { FaExternalLinkAlt, FaCertificate } from 'react-icons/fa'

type CertOrg = { issuingOrganization: string; CertificationList: { certificationName: string; credentialURL: string }[] }

export default function CertificationsPeek({ cvEn }: { cvEn?: any[] }) {
  const cardBg = useColorModeValue('rgba(255,255,255,0.7)', 'rgba(30,41,59,0.5)')
  const cardBorder = useColorModeValue('rgba(15,118,110,0.2)', 'rgba(20,184,166,0.2)')
  const dim = useColorModeValue('gray.600', 'gray.400')
  const orgColor = useColorModeValue('teal.700', 'teal.300')

  const orgs: CertOrg[] = useMemo(() => {
    if (!Array.isArray(cvEn)) return []
    const section = cvEn.find((s: any) => s.sessionName === 'certification')
    if (!section?.certifications) return []
    return section.certifications.filter((org: any) => org?.CertificationList?.length > 0).slice(0, 4)
  }, [cvEn])

  if (!orgs.length) return null

  return (
    <Box w="100%" maxW="1100px">
      {orgs.map((org, oi) => (
        <Box
          as={motion.div as any}
          key={oi}
          initial={{ opacity: 0, y: 12 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.35, delay: oi * 0.1 } as any}
          mb={5}
        >
          <Flex align="center" gap={2} mb={3}>
            <FaCertificate size={14} color="#0f766e" />
            <Text fontSize="sm" fontWeight="700" color={orgColor} fontFamily="'Sora', sans-serif" letterSpacing="0.02em">
              {org.issuingOrganization}
            </Text>
          </Flex>
          <Flex wrap="wrap" gap={2}>
            {(org.CertificationList || []).slice(0, 6).map((c, ci) => (
              <Link
                key={ci}
                href={c.credentialURL || '#'}
                isExternal
                _hover={{ textDecoration: 'none' }}
              >
                <Box
                  as={motion.div as any}
                  bg={cardBg}
                  border="1px solid"
                  borderColor={cardBorder}
                  borderRadius="12px"
                  px={3}
                  py={2}
                  backdropFilter="blur(6px)"
                  whileHover={{ y: -3, borderColor: 'rgba(15,118,110,0.5)' } as any}
                  transition={{ duration: 0.18 } as any}
                >
                  <Flex align="center" gap={2}>
                    <Text fontSize="xs" fontWeight="600" color={dim} lineHeight="1.4">
                      {c.certificationName}
                    </Text>
                    {c.credentialURL && <FaExternalLinkAlt size={9} opacity={0.5} />}
                  </Flex>
                </Box>
              </Link>
            ))}
          </Flex>
        </Box>
      ))}
    </Box>
  )
}

