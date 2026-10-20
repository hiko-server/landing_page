import { Box, Grid, Link, Text } from '@chakra-ui/react'
import NextLink from 'next/link'
import type { WorkOutcome } from '../../lib/caseStudy'
import { useArticleUi } from './articleUi'

/**
 * "At a glance" under a case study's title (D1): the owner's one-line
 * outcome and up to four headline metrics with what they measure and where
 * each number comes from — so a reader who stops here still leaves with the
 * result. Renders nothing until the owner fills the fields in the admin;
 * numbers are never taken from the body.
 *
 * Metrics are a description list (label → value → source); the value is
 * drawn first and large with CSS order, the reading order stays
 * "label, value, source". Tabular figures, hairlines between tiles like the
 * home page's stats.
 */

const MONO = 'var(--font-geist-mono), monospace'

/** Unit glued to the value (93.59%) or after a thin gap (61 ms). */
function Value({ o }: { o: WorkOutcome }) {
  const glued = !!o.unit && /^[%×x°′″+]/.test(o.unit)
  return (
    <>
      {o.value}
      {o.unit ? (
        <Box as="span" fontSize="0.5em" fontWeight={500} letterSpacing="0" color="page.fg-secondary" ml={glued ? '0.04em' : '0.22em'}>
          {o.unit}
        </Box>
      ) : null}
    </>
  )
}

function Source({ o, fallback }: { o: WorkOutcome; fallback: string }) {
  if (!o.source && !o.sourceUrl) return null
  const text = o.source || fallback
  if (!o.sourceUrl) return <>{text}</>
  // An in-page #section stays a plain anchor (a router link would prefetch the page itself).
  if (o.sourceUrl.startsWith('#')) {
    return (
      <Link href={o.sourceUrl} color="accent.text" className="link-underline">
        {text}
      </Link>
    )
  }
  return o.sourceUrl.startsWith('/') ? (
    <Link as={NextLink} href={o.sourceUrl} color="accent.text" className="link-underline">
      {text}
    </Link>
  ) : (
    <Link href={o.sourceUrl} isExternal color="accent.text" className="link-underline">
      {text}
      <span className="nudge-ne" aria-hidden>
        {' '}
        ↗
      </span>
    </Link>
  )
}

export default function AtAGlance({
  summary,
  outcomes,
  lang,
  labelLang,
}: {
  summary?: string
  outcomes?: WorkOutcome[]
  /** Language of the owner's text (the article's). */
  lang?: string
  /** Language of the UI label ("At a glance"), when it differs from the article's. */
  labelLang?: string
}) {
  // The label reads 概览 on a Chinese case study (./articleUi).
  const { t } = useArticleUi()
  const metrics = outcomes || []
  if (!summary && !metrics.length) return null
  const cols = Math.min(metrics.length, 4)
  return (
    <Box as="section" aria-labelledby="glance-heading" mb={10} lang={lang}>
      <Text
        as="h2"
        id="glance-heading"
        lang={labelLang}
        fontFamily={MONO}
        fontSize="11px"
        letterSpacing="0.12em"
        textTransform="uppercase"
        color="page.fg-subtle"
        m={0}
        mb={4}
      >
        {t.atAGlance}
      </Text>
      {summary ? (
        <Text fontSize={{ base: '18px', md: '20px' }} lineHeight="1.45" color="page.fg" maxW="58ch" m={0} mb={metrics.length ? 7 : 0} sx={{ textWrap: 'pretty' }}>
          {summary}
        </Text>
      ) : null}
      {metrics.length ? (
        <Grid
          as="dl"
          m={0}
          templateColumns={{ base: cols === 1 ? '1fr' : 'repeat(2, minmax(0, 1fr))', md: `repeat(${cols}, minmax(0, 1fr))` }}
          borderTop="1px solid"
          borderColor="page.border"
        >
          {metrics.map((o, i) => (
            <Box
              key={`${o.label}-${i}`}
              display="flex"
              flexDirection="column"
              gap={1.5}
              minW={0}
              py={{ base: 4, md: 5 }}
              pr={4}
              pl={{ base: i % 2 === 1 ? 4 : 0, md: i === 0 ? 0 : 5 }}
              borderBottom="1px solid"
              borderColor="page.border"
              // Width per breakpoint, style and colour once: a responsive `border-left`
              // shorthand would reset the colour inside its media query.
              borderLeftWidth={{ base: i % 2 === 1 ? '1px' : 0, md: i === 0 ? 0 : '1px' }}
              borderLeftStyle="solid"
              borderLeftColor="page.border"
            >
              <Box as="dt" order={1} fontSize="13px" lineHeight="1.4" color="page.fg-secondary">
                {o.label}
              </Box>
              <Box
                as="dd"
                order={0}
                m={0}
                className="tnum"
                fontSize="clamp(1.85rem, 1.3rem + 1.6vw, 2.6rem)"
                lineHeight="1"
                fontWeight={500}
                letterSpacing="-0.03em"
                color="page.fg"
                overflowWrap="anywhere"
              >
                <Value o={o} />
              </Box>
              {o.source || o.sourceUrl ? (
                <Box as="dd" order={2} m={0} fontFamily={MONO} fontSize="11px" lineHeight="1.5" color="page.fg-subtle">
                  <Source o={o} fallback={t.metricSource} />
                </Box>
              ) : null}
            </Box>
          ))}
        </Grid>
      ) : null}
    </Box>
  )
}
