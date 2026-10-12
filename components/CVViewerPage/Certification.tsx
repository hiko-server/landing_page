import React from 'react'
import { Link } from '@chakra-ui/react'
import type { Certification } from '../../types/cvProps'
import type { CvLang } from '../../lib/cvVisibility'
import { cvLabels, displayUrl, safeHref } from '../../lib/cvFormat'
import { certificateValidity, field, joinParts, labelled, list } from './fields'
import { EntryStack, EntryText, EntryTitle, MetaLine, SheetEntry, SheetSection } from './primitives'

const CertificateSection = ({ data, lang = 'en' }: { data: Certification; lang?: CvLang }) => {
  const L = cvLabels(lang)
  const rows = list(data, 'certifications').flatMap((org) =>
    list<any>(org, 'CertificationList')
      .filter((c) => field(c, 'certificationName'))
      .map((cert) => ({ org, cert })),
  )
  if (!rows.length) return null
  return (
    <SheetSection title={data.headerName}>
      <EntryStack gap="10px">
        {rows.map(({ org, cert }, i) => {
          const url = field(cert, 'credentialURL')
          const href = safeHref(url)
          return (
            <SheetEntry
              key={i}
              left={
                <>
                  <EntryTitle>{field(cert, 'certificationName')}</EntryTitle>
                  <EntryText>
                    {joinParts(
                      [field(org, 'issuingOrganization'), labelled(L.credentialId, field(cert, 'credentialID'), lang)],
                      ' · ',
                    )}
                  </EntryText>
                  {url && href ? (
                    <Link href={href} isExternal fontSize="12px" color="var(--cv-separator-color, blue)" wordBreak="break-all">
                      {displayUrl(url)}
                    </Link>
                  ) : url ? (
                    <EntryText>{displayUrl(url)}</EntryText>
                  ) : null}
                </>
              }
              right={<MetaLine date={certificateValidity(cert, lang)} />}
            />
          )
        })}
      </EntryStack>
    </SheetSection>
  )
}

export default CertificateSection
