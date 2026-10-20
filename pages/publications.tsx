import { useCallback, useMemo, useState } from 'react'
import type { GetStaticProps } from 'next'
import NextLink from 'next/link'
import { Box, Button, Flex, HStack, Link, Text } from '@chakra-ui/react'
import HeaderFooter from '../layout/HeaderFooter'
import CustomHead from '../components/General-UI/CustomHead'
import PageHeader from '../components/General-UI/PageHeader'
import PublicationItem, { pillProps } from '../components/Publications/PublicationItem'
import { copyText } from '../components/MDX/clipboard'
import { useChromeToast } from '../components/Chrome/useChromeToast'
import { CopyIcon } from '../components/Icons/ui/content'
import OrcidIdLink from '../components/Common/OrcidIdLink'
import { absUrl } from '../lib/schema'
import { ogPresetUrl } from '../lib/og/presets'
import { STATUS_GROUP_LABELS, STATUS_LABELS, type PublicationStatus } from '../lib/publications/types'
import { FILTER_THRESHOLD, applyPublicationFilter, publicationYears, statusCounts, type PublicationFilter } from '../lib/publications/summary'
import type { PublicationsPageData, PublicationsPageItem } from '../lib/publicationsData'
import type { HomeData } from '../lib/homeShape'

/**
 * /publications — the owner's papers, from the Publications section of the
 * CV (website audience: CV Studio's Website switch, every per-field /
 * per-entry / per-author hide applied on the server).
 *
 * Exists only while there is at least one public paper: otherwise
 * getStaticProps answers notFound (404), and the chrome shows no nav link
 * (lib/publicationsData). ISR (60 s) plus on-demand revalidation on every CV
 * write (pages/api/cvdata CV_STATIC_PATHS).
 *
 * English chrome; entries render as entered (Chinese text carries
 * lang="zh-Hans"). Each paper has an anchor (#<citation key>), a formatted
 * citation with the owner emphasised, a status label unless published, its
 * links, a collapsible abstract and Copy BibTeX / Copy APA. Year and status
 * filters appear from FILTER_THRESHOLD papers on. The header shows the
 * owner's ORCID iD once it is public (icon + record URI). JSON-LD: a
 * CollectionPage whose ItemList holds one ScholarlyArticle per paper
 * (lib/publications/jsonld; the owner is identified by the ORCID URI).
 */

type Item = PublicationsPageItem

type Props = PublicationsPageData & {
  /** Always true here: the chrome lists /publications. */
  chromePublications: true
  /** Public home.socials for the persistent header / footer (null = none set). */
  chromeSocials?: HomeData['socials'] | null
}

const MONO = 'var(--font-geist-mono), monospace'
const PATH = '/publications'

const chip = (selected: boolean) => ({
  size: 'xs' as const,
  variant: 'outline' as const,
  h: '28px',
  bg: selected ? 'page.fg' : 'transparent',
  color: selected ? 'page.bg' : 'page.fg-secondary',
  borderColor: selected ? 'page.fg' : 'page.border-strong',
  fontFamily: MONO,
  fontWeight: 500,
  _hover: { borderColor: 'page.fg', bg: selected ? 'page.fg' : 'transparent' },
  _focusVisible: { outline: '2px solid var(--accent)', outlineOffset: '2px' },
})

export default function PublicationsPage({ items, lang, jsonLd, description, summary, orcid, orcidAuthenticated }: Props) {
  const toast = useChromeToast()
  const [filter, setFilter] = useState<PublicationFilter>({ year: null, status: null })
  const filterable = items.length >= FILTER_THRESHOLD
  const pubs = useMemo(() => items.map((i) => i.pub), [items])
  const years = useMemo(() => publicationYears(pubs), [pubs])
  const statuses = useMemo(() => statusCounts(pubs), [pubs])
  const shown = useMemo(() => {
    const keep = new Set(applyPublicationFilter(pubs, filter).map((p) => p.index))
    return items.filter((i) => keep.has(i.pub.index))
  }, [items, pubs, filter])
  const filtered = filter.year !== null || filter.status !== null

  // Group by status when more than one status is shown (the list is already in status order).
  const groups = useMemo(() => {
    const out: Array<{ status: PublicationStatus; items: Item[] }> = []
    for (const it of shown) {
      const last = out[out.length - 1]
      if (last && last.status === it.pub.status) last.items.push(it)
      else out.push({ status: it.pub.status, items: [it] })
    }
    return out
  }, [shown])
  const grouped = groups.length > 1

  const copy = useCallback(
    async (text: string, what: string) => {
      const ok = await copyText(text)
      toast(
        ok
          ? { status: 'success', title: `${what} copied` }
          : { status: 'warning', title: 'Could not copy', description: 'This browser blocked the clipboard.', duration: 5000 },
      )
    },
    [toast],
  )

  const renderItem = (it: Item, headingAs: 'h2' | 'h3') => (
    // data-kbd-item: J / K move through the entries (components/Chrome/KeyboardLayer.tsx).
    <Box as="li" key={it.key} py={{ base: 6, md: 7 }} borderBottom="1px solid" borderColor="page.border" data-kbd-item="">
      <Flex direction={{ base: 'column', sm: 'row' }} gap={{ base: 1.5, sm: 6 }}>
        <Text
          as="span"
          className="tnum"
          flexShrink={0}
          w={{ sm: '56px' }}
          pt={{ sm: '3px' }}
          fontFamily={MONO}
          fontSize="12px"
          color="page.fg-secondary"
        >
          {it.pub.year || 'n.d.'}
        </Text>
        <Box flex="1" minW={0}>
          <PublicationItem
            pub={it.pub}
            parts={it.parts}
            lang="en"
            pageLang="en"
            headingAs={headingAs}
            id={it.key}
            permalink
            showYear={false}
            actions={
              <>
                <Box
                  as="button"
                  type="button"
                  {...pillProps}
                  aria-label={`Copy BibTeX: ${it.pub.title}`}
                  onClick={() => copy(it.bibtex, 'BibTeX')}
                >
                  <CopyIcon size="xs" />
                  Copy BibTeX
                </Box>
                <Box as="button" type="button" {...pillProps} aria-label={`Copy APA: ${it.pub.title}`} onClick={() => copy(it.apa, 'APA citation')}>
                  <CopyIcon size="xs" />
                  Copy APA
                </Box>
              </>
            }
          />
        </Box>
      </Flex>
    </Box>
  )

  const listProps = { as: 'ul' as const, listStyleType: 'none', m: 0, p: 0, borderTop: '1px solid', borderColor: 'page.border' }

  return (
    <>
      <CustomHead
        title="Publications"
        description={description}
        url={absUrl(PATH)}
        image={ogPresetUrl('publications')}
        jsonLd={jsonLd}
      />
      <HeaderFooter>
        <Box maxW="var(--container-content)" mx="auto" px={[4, 6, 8]} py={[12, 16]}>
          <PageHeader
            eyebrow="Research"
            title="Publications."
            lede={
              <>
                {summary.charAt(0).toUpperCase() + summary.slice(1)}. Copy any entry as BibTeX or APA
                {items.length > 1 ? ', or the whole list at once' : ''}.
                {orcid ? (
                  // The author's ORCID iD under the lede: the iD icon, then the record's URI (ORCID's display guidelines).
                  <Box as="span" display="block" mt={3} fontSize="14px" lineHeight="1.6">
                    <OrcidIdLink
                      id={orcid}
                      authenticated={!!orcidAuthenticated}
                      iconSize={16}
                      color="page.fg"
                      _hover={{ color: 'accent.text', textDecoration: 'none' }}
                      _focusVisible={{ outline: '2px solid var(--accent)', outlineOffset: '3px', borderRadius: 'sm' }}
                    />
                  </Box>
                ) : null}
              </>
            }
            actions={
              <>
                {items.length > 1 ? (
                  <Button
                    size="sm"
                    variant="outline"
                    borderColor="page.border-strong"
                    color="page.fg-secondary"
                    fontFamily={MONO}
                    fontSize="11px"
                    letterSpacing="0.04em"
                    leftIcon={<CopyIcon size="xs" />}
                    _hover={{ borderColor: 'var(--accent)', color: 'accent.text' }}
                    onClick={() => copy(items.map((i) => i.bibtex).join('\n\n'), `${items.length} BibTeX entries`)}
                  >
                    Copy all as BibTeX
                  </Button>
                ) : null}
                <Link
                  as={NextLink}
                  href="/cv"
                  fontFamily={MONO}
                  fontSize="12px"
                  color="accent.text"
                  display="inline-flex"
                  alignItems="center"
                  minH="32px"
                  _hover={{ textDecoration: 'underline' }}
                >
                  Full CV
                  <Box as="span" aria-hidden ml={1.5}>
                    →
                  </Box>
                </Link>
              </>
            }
          />

          {filterable ? (
            <Flex direction="column" gap={3} mb={8}>
              {years.length > 1 ? (
                <HStack role="group" aria-label="Filter by year" spacing={2} flexWrap="wrap" rowGap={2}>
                  <Button {...chip(filter.year === null)} aria-pressed={filter.year === null} onClick={() => setFilter((f) => ({ ...f, year: null }))}>
                    all years
                  </Button>
                  {years.map((y) => (
                    <Button key={y || 'nd'} {...chip(filter.year === y)} aria-pressed={filter.year === y} onClick={() => setFilter((f) => ({ ...f, year: y }))} className="tnum">
                      {y || 'n.d.'}
                    </Button>
                  ))}
                </HStack>
              ) : null}
              {statuses.length > 1 ? (
                <HStack role="group" aria-label="Filter by status" spacing={2} flexWrap="wrap" rowGap={2}>
                  <Button {...chip(filter.status === null)} aria-pressed={filter.status === null} onClick={() => setFilter((f) => ({ ...f, status: null }))}>
                    all ({items.length})
                  </Button>
                  {statuses.map((s) => (
                    <Button
                      key={s.status}
                      {...chip(filter.status === s.status)}
                      aria-pressed={filter.status === s.status}
                      onClick={() => setFilter((f) => ({ ...f, status: s.status }))}
                    >
                      {STATUS_LABELS[s.status].en.toLowerCase()} ({s.count})
                    </Button>
                  ))}
                </HStack>
              ) : null}
              <Text role="status" fontFamily={MONO} fontSize="11px" color="page.fg-secondary" className="tnum" m={0}>
                {filtered ? `Showing ${shown.length} of ${items.length}` : ''}
              </Text>
            </Flex>
          ) : null}

          {shown.length === 0 ? (
            <Box border="1px dashed" borderColor="page.border-strong" borderRadius="lg" p={[6, 10]} textAlign="center">
              <Text color="page.fg-secondary" fontSize="14px" mb={3}>
                No paper matches these filters.
              </Text>
              <Button {...chip(false)} onClick={() => setFilter({ year: null, status: null })}>
                clear filters
              </Button>
            </Box>
          ) : grouped ? (
            <Flex direction="column" gap={{ base: 10, md: 12 }}>
              {groups.map((g) => (
                <Box as="section" key={g.status} aria-labelledby={`pub-group-${g.status}`}>
                  <Flex align="baseline" gap={3} mb={3}>
                    <Text as="h2" id={`pub-group-${g.status}`} fontSize={{ base: '20px', md: '22px' }} fontWeight={500} letterSpacing="-0.01em" color="page.fg">
                      {STATUS_GROUP_LABELS[g.status].en}
                    </Text>
                    <Text as="span" fontFamily={MONO} fontSize="12px" color="page.fg-secondary" className="tnum">
                      {g.items.length}
                    </Text>
                  </Flex>
                  <Box {...listProps}>{g.items.map((it) => renderItem(it, 'h3'))}</Box>
                </Box>
              ))}
            </Flex>
          ) : (
            <Box {...listProps} aria-label="Publications">
              {shown.map((it) => renderItem(it, 'h2'))}
            </Box>
          )}

          <Text fontFamily={MONO} fontSize="11px" color="page.fg-secondary" mt={8} lang="en">
            Listed by status, then newest first.{lang === 'zh' ? ' Entries are shown as written in the Chinese CV.' : ''}
          </Text>
        </Box>
      </HeaderFooter>
    </>
  )
}

export const getStaticProps: GetStaticProps<Props> = async () => {
  const { buildPublicationsPage } = await import('../lib/publicationsData')
  const page = buildPublicationsPage()
  if (!page) return { notFound: true, revalidate: 60 }

  let chromeSocials: HomeData['socials'] | null | undefined
  try {
    const { readPublicHome } = await import('../lib/home')
    chromeSocials = readPublicHome()?.socials ?? null
  } catch {
    /* the chrome loads the public home view itself */
  }

  return {
    props: {
      ...page,
      chromePublications: true,
      ...(chromeSocials !== undefined ? { chromeSocials } : {}),
    },
    revalidate: 60,
  }
}
