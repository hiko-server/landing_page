import React from 'react'
import { Box, Flex, Link, Text } from '@chakra-ui/react'
import type { Publications } from '../../types/cvProps'
import type { CvLang } from '../../lib/cvVisibility'
import { formatCvDate } from '../../lib/cvFormat'
import { formatCitationParts, textLang } from '../../lib/publications/citation'
import { ownerNamesFromSections, type OwnerNames } from '../../lib/publications/names'
import { publicPublications } from '../../lib/publications/normalize'
import { LINK_LABELS } from '../../lib/publications/types'
import { cvEntryAnchor, cvSectionAnchor } from './fields'
import { EntryStack, SheetEntry, SheetSection } from './primitives'

/**
 * Publications on the A4 sheet (/cv, /cv/zh, print / PDF, Studio preview),
 * in citation style: title, authors (the owner in bold), venue in italics
 * with volume(issue), pages and publisher, a status label for anything not
 * yet published, the award, and the DOI / PDF / code / slides links — the DOI
 * is spelled out so it survives on paper. The abstract is a disclosure on
 * screen and never printed (.no-print).
 *
 * Entries are sorted (status, then newest first; lib/publications) and keep
 * their CV anchors (`cv-publications-<index>`, the index among visible
 * entries). Renders nothing without a public paper. CVResult loads this
 * module on demand, so a CV without the section ships none of it.
 */

const ABSTRACT = { en: 'Abstract', zh: '摘要' } as const

const PublicationsSection = ({
  data,
  lang = 'en',
  owner,
  sections,
}: {
  data: Publications
  lang?: CvLang
  /** The owner's name forms (both CV languages); default: the sheet's own Personal Info (`sections`). */
  owner?: OwnerNames
  sections?: readonly { sessionName?: string }[]
}) => {
  const list = publicPublications([data])
  if (!list.length) return null
  const me = owner || ownerNamesFromSections(sections || [])
  return (
    <SheetSection title={data.headerName} id={cvSectionAnchor('publications')}>
      <EntryStack gap="12px">
        {list.map((p) => {
          const c = formatCitationParts(p, lang, me)
          const links: Array<{ href: string; label: string; key: string }> = []
          if (c.doiUrl) links.push({ key: 'doi', href: c.doiUrl, label: `doi.org/${p.doi}` })
          if (p.pdfUrl) links.push({ key: 'pdf', href: p.pdfUrl, label: LINK_LABELS.pdf[lang] })
          if (p.codeUrl) links.push({ key: 'code', href: p.codeUrl, label: LINK_LABELS.code[lang] })
          if (p.slidesUrl) links.push({ key: 'slides', href: p.slidesUrl, label: LINK_LABELS.slides[lang] })
          if (p.url) links.push({ key: 'url', href: p.url, label: LINK_LABELS.url[lang] })
          const venueTail = [c.details, c.publisher].filter(Boolean).join('. ')
          return (
            <SheetEntry
              key={p.index}
              id={cvEntryAnchor('publications', p.index)}
              left={
                <>
                  <Text as="h3" fontWeight={800} fontSize="13px" lineHeight="1.35" lang={textLang(c.title, lang)}>
                    {c.title}
                  </Text>
                  {c.authors.length ? (
                    <Text fontSize="12px" lineHeight="1.5">
                      {c.authors.map((a, i) => (
                        <React.Fragment key={i}>
                          {i ? ', ' : null}
                          {a.hidden ? (
                            <>
                              <span aria-hidden>…</span>
                              <span className="sr-only">{lang === 'zh' ? '未显示的作者' : 'an author not shown'}</span>
                            </>
                          ) : a.self ? (
                            <Text as="strong" fontWeight={800} lang={textLang(a.name, lang)}>
                              {a.name}
                            </Text>
                          ) : (
                            <span lang={textLang(a.name, lang)}>{a.name}</span>
                          )}
                        </React.Fragment>
                      ))}
                    </Text>
                  ) : null}
                  {c.venue || venueTail ? (
                    <Text fontSize="12px" lineHeight="1.5">
                      {c.venue ? (
                        <Text as="cite" fontStyle="italic" lang={textLang(c.venue, lang)}>
                          {c.venue}
                        </Text>
                      ) : null}
                      {c.venue && venueTail ? (c.details ? ', ' : '. ') : null}
                      {venueTail}
                    </Text>
                  ) : null}
                  {c.status || c.award ? (
                    <Flex gap="6px" mt="2px" wrap="wrap" align="center">
                      {c.status ? (
                        <Text
                          as="span"
                          fontSize="10px"
                          fontWeight={700}
                          letterSpacing="0.04em"
                          textTransform={lang === 'en' ? 'uppercase' : undefined}
                          border="1px solid var(--cv-separator-color, blue)"
                          color="var(--cv-separator-color, blue)"
                          borderRadius="3px"
                          px="5px"
                          lineHeight="15px"
                        >
                          {c.status}
                        </Text>
                      ) : null}
                      {c.award ? (
                        <Text as="span" fontSize="11.5px" fontStyle="italic" lang={textLang(c.award, lang)}>
                          {c.award}
                        </Text>
                      ) : null}
                    </Flex>
                  ) : null}
                </>
              }
              right={p.date ? <Text fontSize="12px" fontStyle="italic">{formatCvDate(p.date, lang)}</Text> : undefined}
            >
              {links.length ? (
                <Text fontSize="11px" lineHeight="1.5" mt="2px">
                  {links.map((l, i) => (
                    <React.Fragment key={l.key}>
                      {i ? (
                        <Box as="span" px="5px" color="#777">
                          ·
                        </Box>
                      ) : null}
                      <Link href={l.href} isExternal color="var(--cv-separator-color, blue)" wordBreak={l.key === 'doi' ? 'break-all' : undefined}>
                        {l.label}
                      </Link>
                    </React.Fragment>
                  ))}
                </Text>
              ) : null}
              {p.abstract ? (
                <Box
                  as="details"
                  className="no-print"
                  mt="3px"
                  fontSize="11.5px"
                  lineHeight="1.55"
                  sx={{
                    summary: { cursor: 'pointer', color: 'var(--cv-separator-color, blue)', width: 'fit-content' },
                    'summary:focus-visible': { outline: '2px solid var(--cv-separator-color, blue)', outlineOffset: '2px' },
                  }}
                >
                  <summary>{ABSTRACT[lang]}</summary>
                  <Text mt="2px" color="#333" whiteSpace="pre-line" lang={textLang(p.abstract, lang)}>
                    {p.abstract}
                  </Text>
                </Box>
              ) : null}
            </SheetEntry>
          )
        })}
      </EntryStack>
    </SheetSection>
  )
}

export default PublicationsSection
