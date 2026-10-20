import React from 'react'
import { Box, Flex, Link, Text } from '@chakra-ui/react'
import type { PersonalInformation } from '../../types/cvProps'
import type { CvLang } from '../../lib/cvVisibility'
import { cvLabels, displayUrl, safeHref } from '../../lib/cvFormat'
import { profileLinks } from '../../lib/cvLinks'
import EmailText from '../Common/EmailText'
import OrcidIdLink from '../Common/OrcidIdLink'
import { composeName } from './cvName'
import { cvSectionAnchor, field } from './fields'
import { ANCHOR_SCROLL_MARGIN } from './primitives'
import { SheetHeaderExtras, useCvHeaderLines } from './HeaderExtras'

export { composeName, publicNameZh } from './cvName'

/**
 * A4 header: name + website on the left, location and contact on the right,
 * optional summary underneath. Hidden fields (blank + `redacted`, or still
 * listed in hiddenFields on an editor document) are skipped together with
 * their label and separator; the block disappears entirely only when nothing
 * at all is left to show.
 *
 * The name is a styled paragraph, not a heading: the page's h1 is the /cv
 * PageHeader and the sheet's section titles are the h2s. E-mail and phone
 * render through EmailText (Cloudflare-safe, hydration-safe).
 *
 * Profile links (GitHub / LinkedIn, lib/cvLinks.ts) follow the website on
 * the name's line: the page decorates the public section with them (the
 * CV's own value, else Home → Socials; nothing for a hidden field). The
 * ORCID iD, when set, takes the next line as ORCID's display guidelines
 * want it: the iD icon, then the full https://orcid.org/… URI.
 */

const PersonalInformationSection = ({ data, lang = 'en' }: { data: PersonalInformation; lang?: CvLang }) => {
  const L = cvLabels(lang)
  const { main, aside } = composeName(data, lang)
  const website = field(data, 'personalWebsite')
  const websiteHref = safeHref(website)
  const allProfiles = profileLinks(data)
  const profiles = allProfiles.filter((p) => p.kind !== 'orcid')
  const orcid = allProfiles.find((p) => p.kind === 'orcid')
  const address = field(data, 'address')
  const phone = field(data, 'phoneNumber')
  const email = field(data, 'email')
  const intro = field(data, 'introduction')
  // Owner-entered lines from the availability (right-to-work, 求职意向), via context.
  const extras = useCvHeaderLines(lang)

  const hasHeader = !!(main || aside || website || profiles.length || orcid || address || phone || email)
  if (!hasHeader && !intro) return null
  const sep = lang === 'zh' ? '：' : ': '

  return (
    <Box as="header" className="cv-sheet-section" id={cvSectionAnchor('personalInformation')} sx={{ scrollMarginTop: ANCHOR_SCROLL_MARGIN }}>
      {hasHeader ? (
        <Flex
          px="10px"
          pb="14px"
          justify="space-between"
          align="flex-end"
          gap="16px"
          borderBottom={intro && !extras.length ? '3px solid var(--cv-separator-color, blue)' : undefined}
        >
          <Box minW={0}>
            {main || aside ? (
              <Text fontSize="24px" fontWeight={600} lineHeight="1.2">
                {main}
                {aside ? (
                  <Text as="span" fontSize="15px" fontWeight={500} color="#555" ml="8px">
                    {aside}
                  </Text>
                ) : null}
              </Text>
            ) : null}
            {website || profiles.length ? (
              <Text fontSize="12px" mt="2px" lineHeight="1.5">
                {website && websiteHref ? (
                  <Link href={websiteHref} isExternal color="var(--cv-separator-color, blue)">
                    {displayUrl(website)}
                  </Link>
                ) : website ? (
                  displayUrl(website)
                ) : null}
                {profiles.map((p, i) => (
                  <React.Fragment key={p.kind}>
                    {website || i > 0 ? (
                      <Text as="span" px="5px" aria-hidden>
                        ·
                      </Text>
                    ) : null}
                    <Link href={p.href} isExternal color="var(--cv-separator-color, blue)" aria-label={`${p.label}: ${p.text}`}>
                      {p.text}
                    </Link>
                  </React.Fragment>
                ))}
              </Text>
            ) : null}
            {orcid ? (
              <Text fontSize="12px" mt="3px" lineHeight="1.5">
                <OrcidIdLink id={orcid.href} iconSize={16} color="var(--cv-separator-color, blue)" verticalAlign="top" />
              </Text>
            ) : null}
          </Box>
          {address || phone || email ? (
            <Flex direction="column" align="flex-end" textAlign="right" fontSize="12px" lineHeight="1.5" flexShrink={0}>
              {address ? <Text>{address}</Text> : null}
              {phone || email ? (
                <Text>
                  {phone ? (
                    <>
                      {L.phone}
                      {sep}
                      <EmailText value={phone} />
                    </>
                  ) : null}
                  {phone && email ? (
                    <Text as="span" px="5px">
                      |
                    </Text>
                  ) : null}
                  {email ? (
                    <>
                      {L.email}
                      {sep}
                      <EmailText value={email} />
                    </>
                  ) : null}
                </Text>
              ) : null}
            </Flex>
          ) : null}
        </Flex>
      ) : null}
      {hasHeader ? <SheetHeaderExtras lines={extras} lang={lang} rule={!!intro} /> : null}
      {intro ? (
        <Box px="10px" pt="8px" pb="16px">
          <Text fontSize="12px" lineHeight="1.55">
            {intro}
          </Text>
        </Box>
      ) : null}
    </Box>
  )
}

export default PersonalInformationSection
