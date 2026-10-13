import { Box } from '@chakra-ui/react'
import PublicationItem from './PublicationItem'
import { ANCHOR_SCROLL_MARGIN } from '../CVViewerPage/primitives'
import { cvEntryAnchor } from '../CVViewerPage/fields'
import { formatCitationParts } from '../../lib/publications/citation'
import { NO_OWNER_NAMES, type OwnerNames } from '../../lib/publications/names'
import { publicPublications } from '../../lib/publications/normalize'
import type { PubLang } from '../../lib/publications/types'

/**
 * The Publications card body of the /cv Reading view (phones): one entry per
 * paper, separated by hairlines like the other cards, each carrying the
 * sheet's anchor as data-cv-anchor. Loaded on demand by ReadingView only when
 * the section has a paper, so the CV page ships none of this otherwise.
 */
export default function ReadingPublications({ section, lang, owner = NO_OWNER_NAMES }: { section: unknown; lang: PubLang; owner?: OwnerNames }) {
  const papers = publicPublications([section])
  if (!papers.length) return null
  return (
    <Box as="ul" listStyleType="none" m={0} p={0}>
      {papers.map((p, i) => (
        <Box
          as="li"
          key={p.index}
          data-cv-anchor={cvEntryAnchor('publications', p.index)}
          py={3}
          borderTop={i === 0 ? undefined : '1px solid'}
          borderColor="page.border"
          sx={{ scrollMarginTop: ANCHOR_SCROLL_MARGIN }}
        >
          <PublicationItem pub={p} parts={formatCitationParts(p, lang, owner)} lang={lang} headingAs="h3" size="compact" />
        </Box>
      ))}
    </Box>
  )
}
