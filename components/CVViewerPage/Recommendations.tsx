import { Box, Link, Text } from '@chakra-ui/react'
import type { CvLang } from '../../lib/cvVisibility'
import { cvEntryAnchor, cvSectionAnchor } from './fields'
import { EntryStack, SheetSection, ANCHOR_SCROLL_MARGIN } from './primitives'
import { recommendationCredit, recommendationItems } from './recommendationView'

/**
 * A4 sheet: owner-entered recommendations (E11) as quotes with their credit
 * line. Only entries with the person's permission reach this component
 * (lib/cvVisibility); nothing renders until one exists.
 */
const RecommendationsSection = ({ data, lang = 'en' }: { data: { headerName?: string; [k: string]: unknown }; lang?: CvLang }) => {
  const items = recommendationItems(data)
  if (!items.length) return null
  return (
    <SheetSection title={data.headerName} id={cvSectionAnchor('recommendations')}>
      <EntryStack gap="10px">
        {items.map(({ item, index }) => {
          const credit = recommendationCredit(item, lang)
          return (
            <Box
              as="figure"
              key={index}
              id={cvEntryAnchor('recommendations', index)}
              m={0}
              sx={{ breakInside: 'avoid', pageBreakInside: 'avoid', scrollMarginTop: ANCHOR_SCROLL_MARGIN }}
            >
              <Box
                as="blockquote"
                m={0}
                pl="10px"
                borderLeft="2px solid var(--cv-separator-color, blue)"
                fontSize="12px"
                lineHeight="1.55"
                fontStyle="italic"
                cite={item.sourceUrl || undefined}
              >
                “{item.quote}”
              </Box>
              <Text as="figcaption" mt="3px" pl="12px" fontSize="11.5px" lineHeight="1.5" color="#333">
                —{' '}
                {item.sourceUrl ? (
                  <Link href={item.sourceUrl} isExternal fontWeight={700} color="inherit">
                    {item.name}
                  </Link>
                ) : (
                  <Text as="span" fontWeight={700}>
                    {item.name}
                  </Text>
                )}
                {credit ? `, ${credit}` : ''}
              </Text>
            </Box>
          )
        })}
      </EntryStack>
    </SheetSection>
  )
}

export default RecommendationsSection
