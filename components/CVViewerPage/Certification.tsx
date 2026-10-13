import { Link } from '@chakra-ui/react'
import type { Certification } from '../../types/cvProps'
import type { CvLang } from '../../lib/cvVisibility'
import { cvLabels, displayUrl, safeHref } from '../../lib/cvFormat'
import { certificateValidity, cvEntryAnchor, cvSectionAnchor, field, indexedCertificates, joinParts, labelled } from './fields'
import { EntryStack, EntryText, EntryTitle, MetaLine, SheetEntry, SheetSection } from './primitives'

const CertificateSection = ({ data, lang = 'en' }: { data: Certification; lang?: CvLang }) => {
  const L = cvLabels(lang)
  const rows = indexedCertificates(data).filter(({ cert }) => field(cert, 'certificationName'))
  if (!rows.length) return null
  return (
    <SheetSection title={data.headerName} id={cvSectionAnchor('certification')}>
      <EntryStack gap="10px">
        {rows.map(({ org, cert, index }) => {
          const url = field(cert, 'credentialURL')
          const href = safeHref(url)
          return (
            <SheetEntry
              key={index}
              id={cvEntryAnchor('certification', index)}
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
