import { Box, Flex, Text } from '@chakra-ui/react'
import { Patents } from '../../types/cvProps'
import type { CvLang } from '../../lib/cvVisibility'
import { cleanList, cvLabels, formatCvDate } from '../../lib/cvFormat'
import CVSectionShell, { CVRow } from './_CVSectionShell'

const t = (v: unknown) => (typeof v === 'string' ? v.trim() : '')

const PatentsSection = ({
  index,
  data,
  lang = 'en',
}: {
  index?: number
  data: Patents
  lang?: CvLang
}) => {
  const L = cvLabels(lang)
  // Semantic tokens (first-paint correct in both modes, see _CVSectionShell).
  const text = 'page.fg-prose'
  const chipBg = 'page.hover'
  const chipBorder = 'page.border'
  const groups = (data?.patentExperience || []).filter((g) => t(g.title) || cleanList(g.patents).length)
  if (!groups.length) return null
  const total = groups.reduce((n, g) => n + cleanList(g.patents).length, 0)
  return (
    <CVSectionShell index={index} label={data?.headerName || 'Patents'} count={total || groups.length} countSuffix={L.items}>
      <Flex direction="column">
        {groups.map((g, i) => (
          <CVRow
            key={i}
            isFirst={i === 0}
            title={t(g.title) || L.items}
            subtitle={t(g.organization) || undefined}
            meta={[t(g.authority), t(g.status)].filter(Boolean).join(' · ') || undefined}
            period={formatCvDate(g.date, lang) || undefined}
          >
            {cleanList(g.patents).length ? (
              <Box as="ol" listStyleType="none" display="grid" gridTemplateColumns={['1fr', '1fr 1fr']} gap={2}>
                {cleanList(g.patents).map((p, j) => (
                  <Flex
                    as="li"
                    key={j}
                    gap={3}
                    align="flex-start"
                    px={3}
                    py={2}
                    bg={chipBg}
                    border="1px solid"
                    borderColor={chipBorder}
                    borderRadius="4px"
                  >
                    <Text as="span" fontFamily="mono" fontSize="10px" color="accent.text" pt="3px" flexShrink={0}>
                      {String(j + 1).padStart(2, '0')}
                    </Text>
                    <Text as="span" fontSize="13px" color={text} lineHeight="1.5">
                      {p}
                    </Text>
                  </Flex>
                ))}
              </Box>
            ) : null}
          </CVRow>
        ))}
      </Flex>
    </CVSectionShell>
  )
}

export default PatentsSection
