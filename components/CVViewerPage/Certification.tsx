import React from 'react'
import { Link } from '@chakra-ui/react'
import type { Certification } from '../../types/cvProps'
import type { CvLang } from '../../lib/cvVisibility'
import { cvLabels, displayUrl, formatCvDate, hrefOf } from '../../lib/cvFormat'
import { EntryStack, EntryText, EntryTitle, MetaLine, SheetEntry, SheetSection } from './primitives'

const t = (v: unknown) => (typeof v === 'string' ? v.trim() : '')

const CertificateSection = ({ data, lang = 'en' }: { data: Certification; lang?: CvLang }) => {
  const L = cvLabels(lang)
  const rows = (data.certifications || []).flatMap((org) =>
    (org.CertificationList || [])
      .filter((c) => t(c.certificationName))
      .map((cert) => ({ org, cert })),
  )
  if (!rows.length) return null
  const sep = lang === 'zh' ? '：' : ': '
  return (
    <SheetSection title={data.headerName}>
      <EntryStack gap="10px">
        {rows.map(({ org, cert }, i) => {
          const issued = formatCvDate(cert.issuedDate, lang)
          const range = issued ? `${issued} – ${t(cert.expirationDate) ? formatCvDate(cert.expirationDate, lang) : L.noExpiry}` : ''
          return (
            <SheetEntry
              key={i}
              left={
                <>
                  <EntryTitle>{cert.certificationName}</EntryTitle>
                  <EntryText>
                    {[t(org.issuingOrganization), t(cert.credentialID) ? `${L.credentialId}${sep}${t(cert.credentialID)}` : '']
                      .filter(Boolean)
                      .join(' · ')}
                  </EntryText>
                  {t(cert.credentialURL) ? (
                    <Link href={hrefOf(cert.credentialURL)} isExternal fontSize="12px" color="var(--cv-separator-color, blue)" wordBreak="break-all">
                      {displayUrl(cert.credentialURL)}
                    </Link>
                  ) : null}
                </>
              }
              right={<MetaLine date={range} />}
            />
          )
        })}
      </EntryStack>
    </SheetSection>
  )
}

export default CertificateSection
