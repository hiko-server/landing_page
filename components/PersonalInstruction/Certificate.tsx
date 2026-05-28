import React from 'react'
import { Box, Flex, Link, Text, useColorModeValue } from '@chakra-ui/react'
import { DateTime } from 'luxon'
import { Certification } from '../../types/cvProps'
import CVSectionShell, { CVRow } from './_CVSectionShell'

/**
 * Certificate section — different shape:
 * Outer level groups by issuing organisation, inner level is each cert.
 */

const monoFont = 'var(--font-geist-mono), ui-monospace, monospace'

const fmt = (iso?: string) =>
  iso && DateTime.fromISO(iso).isValid
    ? DateTime.fromISO(iso).toFormat('LLL yyyy')
    : iso || ''

const CertificateSection = ({
  index,
  data,
}: {
  index?: number
  data: Certification
}) => {
  const labelColor = useColorModeValue('gray.600', 'gray.500')
  const divider = useColorModeValue('rgba(0,0,0,0.08)', 'rgba(255,255,255,0.08)')
  const totalCerts = (data?.certifications || []).reduce(
    (acc, org) => acc + (org.CertificationList?.length || 0),
    0,
  )

  return (
    <CVSectionShell
      index={index}
      label={data?.headerName || 'Certifications'}
      count={totalCerts}
    >
      <Flex direction="column" gap={6}>
        {(data?.certifications || []).map((org, orgI) => (
          <Box key={orgI}>
            <Flex align="center" gap={3} mb={3}>
              {org.organizationURL ? (
                <Link
                  href={`https://${org.organizationURL}`}
                  isExternal
                  fontFamily={monoFont}
                  fontSize="11px"
                  letterSpacing="0.08em"
                  color={labelColor}
                  textTransform="uppercase"
                  sx={{
                    _hover: { color: 'var(--accent)', textDecoration: 'none' },
                  }}
                >
                  {org.issuingOrganization} ↗
                </Link>
              ) : (
                <Text
                  fontFamily={monoFont}
                  fontSize="11px"
                  letterSpacing="0.08em"
                  color={labelColor}
                  textTransform="uppercase"
                >
                  {org.issuingOrganization}
                </Text>
              )}
              <Box flex="1" h="1px" bg={divider} />
            </Flex>

            <Flex direction="column">
              {(org.CertificationList || []).map((cert, certI) => (
                <CVRow
                  key={certI}
                  isFirst={certI === 0}
                  title={cert.certificationName}
                  subtitle={
                    cert.credentialID ? `Credential ID: ${cert.credentialID}` : undefined
                  }
                  period={`${fmt(cert.issuedDate)} — ${
                    cert.expirationDate ? fmt(cert.expirationDate) : 'No Expiry'
                  }`}
                >
                  {cert.credentialURL && (
                    <Link
                      href={cert.credentialURL}
                      isExternal
                      fontFamily={monoFont}
                      fontSize="11px"
                      color="var(--accent)"
                      letterSpacing="0.04em"
                      sx={{
                        _hover: { textDecoration: 'underline' },
                      }}
                    >
                      View Credential ↗
                    </Link>
                  )}
                </CVRow>
              ))}
            </Flex>
          </Box>
        ))}
      </Flex>
    </CVSectionShell>
  )
}

export default CertificateSection
