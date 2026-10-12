import React from 'react'
import { Box, Flex, Link, Text } from '@chakra-ui/react'
import { Certification } from '../../types/cvProps'
import type { CvLang } from '../../lib/cvVisibility'
import { cvLabels, displayUrl, safeHref } from '../../lib/cvFormat'
import { certificateValidity } from '../CVViewerPage/fields'
import CVSectionShell, { CVRow } from './_CVSectionShell'

/**
 * Certificate section — different shape:
 * Outer level groups by issuing organisation, inner level is each cert.
 *
 * Validity comes from certificateValidity(): "No Expiry" only when the
 * expiry is genuinely empty, never when the owner hid it. Links only for
 * safe URLs (safeHref) — anything else renders as text.
 */

const monoFont = 'var(--font-geist-mono), ui-monospace, monospace'

const t = (v: unknown) => (typeof v === 'string' ? v.trim() : '')

const CertificateSection = ({
  index,
  data,
  lang = 'en',
}: {
  index?: number
  data: Certification
  lang?: CvLang
}) => {
  const L = cvLabels(lang)
  const orgs = (data?.certifications || [])
    .map((org) => ({ ...org, CertificationList: (org.CertificationList || []).filter((c) => t(c.certificationName)) }))
    .filter((org) => org.CertificationList.length > 0)
  const totalCerts = orgs.reduce((acc, org) => acc + org.CertificationList.length, 0)
  if (!totalCerts) return null

  return (
    <CVSectionShell
      index={index}
      label={data?.headerName || 'Certifications'}
      count={totalCerts}
      countSuffix={L.entries}
    >
      <Flex direction="column" gap={6}>
        {orgs.map((org, orgI) => (
          <Box key={orgI}>
            <Flex align="center" gap={3} mb={3}>
              {safeHref(org.organizationURL) ? (
                <Link
                  href={safeHref(org.organizationURL)}
                  isExternal
                  fontFamily={monoFont}
                  fontSize="11px"
                  letterSpacing="0.08em"
                  color="page.fg-secondary"
                  textTransform="uppercase"
                  sx={{
                    _hover: { color: 'var(--accent)', textDecoration: 'none' },
                  }}
                >
                  {org.issuingOrganization}{' '}
                  <span aria-hidden>↗</span>
                </Link>
              ) : (
                <Text
                  fontFamily={monoFont}
                  fontSize="11px"
                  letterSpacing="0.08em"
                  color="page.fg-secondary"
                  textTransform="uppercase"
                >
                  {org.issuingOrganization}
                </Text>
              )}
              <Box flex="1" h="1px" bg="page.border" />
            </Flex>

            <Flex direction="column">
              {(org.CertificationList || []).map((cert, certI) => (
                <CVRow
                  key={certI}
                  isFirst={certI === 0}
                  title={cert.certificationName}
                  subtitle={
                    t(cert.credentialID) ? `${L.credentialId}: ${t(cert.credentialID)}` : undefined
                  }
                  period={certificateValidity(cert, lang) || undefined}
                >
                  {safeHref(cert.credentialURL) && (
                    <Link
                      href={safeHref(cert.credentialURL)}
                      title={displayUrl(cert.credentialURL)}
                      isExternal
                      fontFamily={monoFont}
                      fontSize="11px"
                      color="var(--accent)"
                      letterSpacing="0.04em"
                      sx={{
                        _hover: { textDecoration: 'underline' },
                      }}
                    >
                      {L.viewCredential} <span aria-hidden>↗</span>
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
