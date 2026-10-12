import React from 'react'
import { Box, Flex, Link, Text } from '@chakra-ui/react'
import type { PersonalInformation } from '../../types/cvProps'
import type { CvLang } from '../../lib/cvVisibility'
import { cvLabels, displayUrl, hrefOf } from '../../lib/cvFormat'

/**
 * A4 header: name + website on the left, location and contact on the right,
 * optional summary underneath. Hidden fields arrive blank and are skipped;
 * the block disappears entirely only when nothing at all is left to show.
 */

const t = (v: unknown) => (typeof v === 'string' ? v.trim() : '')

export function composeName(data: Partial<PersonalInformation>, lang: CvLang): { main: string; aside: string } {
  const first = t(data.firstName)
  const last = t(data.lastName)
  const nick = t(data.nickName)
  if (lang === 'zh') {
    // Chinese order: family name + given name, preferred name as a quiet aside.
    return { main: `${last}${first}`, aside: nick }
  }
  const lead = [nick, last.toUpperCase()].filter(Boolean).join(' ')
  return { main: [lead, first].filter(Boolean).join(', '), aside: '' }
}

const PersonalInformationSection = ({ data, lang = 'en' }: { data: PersonalInformation; lang?: CvLang }) => {
  const L = cvLabels(lang)
  const { main, aside } = composeName(data, lang)
  const website = t(data.personalWebsite)
  const address = t(data.address)
  const phone = t(data.phoneNumber)
  const email = t(data.email)
  const intro = t(data.introduction)

  const hasHeader = !!(main || aside || website || address || phone || email)
  if (!hasHeader && !intro) return null

  const sep = lang === 'zh' ? '：' : ': '

  return (
    <Box as="header" className="cv-sheet-section">
      {hasHeader ? (
        <Flex
          px="10px"
          pb="14px"
          justify="space-between"
          align="flex-end"
          gap="16px"
          borderBottom={intro ? '3px solid var(--cv-separator-color, blue)' : undefined}
        >
          <Box minW={0}>
            {main || aside ? (
              <Text as="h2" fontSize="24px" fontWeight={600} lineHeight="1.2">
                {main}
                {aside ? (
                  <Text as="span" fontSize="15px" fontWeight={500} color="#555" ml="8px">
                    {aside}
                  </Text>
                ) : null}
              </Text>
            ) : null}
            {website ? (
              <Link
                href={hrefOf(website)}
                isExternal
                color="var(--cv-separator-color, blue)"
                fontSize="12px"
                display="inline-block"
                mt="2px"
              >
                {displayUrl(website)}
              </Link>
            ) : null}
          </Box>
          {address || phone || email ? (
            <Flex direction="column" align="flex-end" textAlign="right" fontSize="12px" lineHeight="1.5" flexShrink={0}>
              {address ? <Text>{address}</Text> : null}
              {phone || email ? (
                <Text>
                  {phone ? `${L.phone}${sep}${phone}` : null}
                  {phone && email ? (
                    <Text as="span" px="5px">
                      |
                    </Text>
                  ) : null}
                  {email ? `${L.email}${sep}${email}` : null}
                </Text>
              ) : null}
            </Flex>
          ) : null}
        </Flex>
      ) : null}
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
