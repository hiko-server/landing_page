import React, { useId, useState } from 'react'
import { Box, Flex, Link, Text } from '@chakra-ui/react'
import { Collapse } from '../General-UI/Collapse'
import { clearOfHeader } from '../../lib/anchorOffset'
import { textLang, type CitationParts } from '../../lib/publications/citation'
import { LINK_LABELS, type PubLang, type Publication } from '../../lib/publications/types'
import { ChevronDownIcon } from '../Icons/ui/chrome'
import { StarIcon } from '../Icons/ui/content'

/**
 * One publication on the web (/publications and the /cv Reading view):
 *
 *   Title                                         (heading, optional permalink)
 *   Authors — the owner in bold, a hidden author as "…"
 *   Venue, 12(3), 45–67 · Publisher · 2025       (venue in italics)
 *   [Under review] [★ Best Paper Award]           (status only when not published)
 *   doi:10.… · PDF · Code · Slides · Paper · Abstract ▾ · [actions]
 *   abstract + keywords (collapsible, closed by default)
 *
 * Everything shown comes from the public, normalised publication; labels
 * follow `lang`, and entered text gets a `lang` attribute when its script
 * differs from the page (WCAG 3.1.2). Transitions are the shared Collapse's
 * (instant under reduced motion).
 */

const MONO = 'var(--font-geist-mono), ui-monospace, monospace'

const ABSTRACT = { en: 'Abstract', zh: '摘要' } as const
const KEYWORDS = { en: 'Keywords', zh: '关键词' } as const
const HIDDEN_AUTHOR = { en: 'an author not shown', zh: '未显示的作者' } as const
const NEW_TAB = { en: '(opens in a new tab)', zh: '（在新标签页打开）' } as const

export type PublicationItemProps = {
  pub: Publication
  parts: CitationParts
  /** Language of the labels. */
  lang: PubLang
  /** Language of the page around the item (decides which entered text needs a `lang`). */
  pageLang?: PubLang
  headingAs?: 'h2' | 'h3'
  /** Anchor id of the item, and whether its heading carries a "#" permalink to it. */
  id?: string
  permalink?: boolean
  /** data-cv-anchor (the /cv Reading view mirrors the sheet's anchors). */
  cvAnchor?: string
  /** Show the year in the venue line (the /publications page shows it in its own column). */
  showYear?: boolean
  /** Extra controls in the link row (Copy BibTeX / Copy APA). */
  actions?: React.ReactNode
  size?: 'page' | 'compact'
}

function Chevron({ open }: { open: boolean }) {
  return (
    <Box
      as="span"
      aria-hidden
      display="inline-flex"
      transition="transform var(--duration-fast) var(--ease-standard)"
      transform={open ? 'rotate(180deg)' : 'none'}
    >
      <ChevronDownIcon size="xs" />
    </Box>
  )
}

/** Outline pill used for links and toggles in the link row (≥ 28px tall). */
export const pillProps = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: '6px',
  minH: '28px',
  px: 2.5,
  borderRadius: 'full',
  border: '1px solid',
  borderColor: 'page.border-strong',
  fontFamily: MONO,
  fontSize: '11.5px',
  letterSpacing: '0.02em',
  color: 'page.fg-secondary',
  bg: 'transparent',
  _hover: { borderColor: 'var(--accent)', color: 'accent.text', textDecoration: 'none' },
  _focusVisible: { outline: '2px solid var(--accent)', outlineOffset: '2px' },
} as const

function ExternalPill({ href, children, lang, label }: { href: string; children: React.ReactNode; lang: PubLang; label?: string }) {
  return (
    <Link href={href} target="_blank" rel="noopener noreferrer" {...pillProps} title={label}>
      {children}
      <Box as="span" aria-hidden color="page.fg-subtle">
        ↗
      </Box>
      <span className="sr-only"> {NEW_TAB[lang]}</span>
    </Link>
  )
}

export function AuthorLine({ parts, lang, pageLang, fontSize }: { parts: CitationParts; lang: PubLang; pageLang: PubLang; fontSize: any }) {
  if (!parts.authors.length) return null
  return (
    <Text fontSize={fontSize} lineHeight="1.55" color="page.fg-secondary" mt={1.5}>
      {parts.authors.map((a, i) => (
        <React.Fragment key={i}>
          {i ? ', ' : null}
          {a.hidden ? (
            <>
              <span aria-hidden>…</span>
              <span className="sr-only">{HIDDEN_AUTHOR[lang]}</span>
            </>
          ) : a.self ? (
            <Text as="strong" fontWeight={600} color="page.fg" lang={textLang(a.name, pageLang)}>
              {a.name}
            </Text>
          ) : (
            <span lang={textLang(a.name, pageLang)}>{a.name}</span>
          )}
        </React.Fragment>
      ))}
    </Text>
  )
}

export default function PublicationItem({
  pub,
  parts,
  lang,
  pageLang = lang,
  headingAs = 'h3',
  id,
  permalink = false,
  cvAnchor,
  showYear = true,
  actions,
  size = 'page',
}: PublicationItemProps) {
  const [open, setOpen] = useState(false)
  const uid = useId()
  const headingId = `${uid}-title`
  const panelId = `${uid}-abstract`
  const body = size === 'page' ? { base: '15px', md: '15.5px' } : { base: '15px', sm: '16px' }

  // "Venue, 12(3), 45–67 · Publisher · 2025": where it appeared (with its
  // numbers), then who published it and when.
  const where: React.ReactNode[] = []
  if (parts.venue) {
    where.push(
      <Text as="cite" key="venue" fontStyle="italic" color="page.fg" lang={textLang(parts.venue, pageLang)}>
        {parts.venue}
      </Text>,
    )
  }
  if (parts.details) {
    where.push(
      <Box as="span" key="details" whiteSpace="nowrap" className="tnum">
        {parts.details}
      </Box>,
    )
  }
  const venueLine: React.ReactNode[] = []
  if (where.length) {
    venueLine.push(
      <React.Fragment key="where">
        {where.map((x, i) => (
          <React.Fragment key={i}>
            {i ? ', ' : null}
            {x}
          </React.Fragment>
        ))}
      </React.Fragment>,
    )
  }
  if (parts.publisher) {
    venueLine.push(
      <span key="publisher" lang={textLang(parts.publisher, pageLang)}>
        {parts.publisher}
      </span>,
    )
  }
  if (showYear && parts.year) {
    venueLine.push(
      <span key="year" className="tnum">
        {parts.year}
      </span>,
    )
  }

  const links: React.ReactNode[] = []
  if (parts.doiUrl) {
    links.push(
      <ExternalPill key="doi" href={parts.doiUrl} lang={lang} label={`${LINK_LABELS.doi[lang]} ${pub.doi}`}>
        <Box as="span" color="page.fg-subtle">
          doi:
        </Box>
        <Box as="span" wordBreak="break-all" textTransform="none">
          {pub.doi}
        </Box>
      </ExternalPill>,
    )
  }
  for (const [key, href] of [
    ['pdf', pub.pdfUrl],
    ['code', pub.codeUrl],
    ['slides', pub.slidesUrl],
    ['url', pub.url],
  ] as const) {
    if (href) {
      links.push(
        <ExternalPill key={key} href={href} lang={lang}>
          {LINK_LABELS[key][lang]}
        </ExternalPill>,
      )
    }
  }
  const hasAbstract = !!(pub.abstract || pub.keywords.length)

  // The permalink sits after the heading, not inside it, so it is not part of the title's accessible name.
  const Heading = (
    <Box>
      <Text
        as={headingAs}
        id={headingId}
        display="inline"
        fontSize={size === 'page' ? { base: '17px', md: '18px' } : { base: '16px', sm: '17px' }}
        fontWeight={600}
        lineHeight="1.35"
        letterSpacing="-0.01em"
        color="page.fg"
        lang={textLang(parts.title, pageLang)}
        sx={{ textWrap: 'pretty' }}
      >
        {parts.title}
      </Text>
      {permalink && id ? (
        <Link
          href={`#${id}`}
          className="pub-permalink"
          display="inline-flex"
          alignItems="center"
          justifyContent="center"
          verticalAlign="middle"
          minW="24px"
          minH="24px"
          ml={1}
          borderRadius="md"
          color="page.fg-subtle"
          fontFamily={MONO}
          fontSize="14px"
          _hover={{ color: 'accent.text', textDecoration: 'none' }}
          _focusVisible={{ outline: '2px solid var(--accent)', outlineOffset: '0px', opacity: 1 }}
          aria-label={lang === 'zh' ? '此论文的链接' : 'Link to this paper'}
        >
          <span aria-hidden>#</span>
        </Link>
      ) : null}
    </Box>
  )

  return (
    <Box
      as="article"
      id={id}
      aria-labelledby={headingId}
      data-cv-anchor={cvAnchor}
      sx={{
        scrollMarginTop: clearOfHeader('24px'),
        '.pub-permalink': { opacity: { base: 1, md: 0 }, transition: 'opacity var(--duration-fast) var(--ease-standard)' },
        '&:hover .pub-permalink, &:focus-within .pub-permalink': { opacity: 1 },
      }}
    >
      {Heading}
      <AuthorLine parts={parts} lang={lang} pageLang={pageLang} fontSize={body} />
      {venueLine.length ? (
        <Text fontSize={body} lineHeight="1.55" color="page.fg-secondary" mt={0.5}>
          {venueLine.map((x, i) => (
            <React.Fragment key={i}>
              {i ? ' · ' : null}
              {x}
            </React.Fragment>
          ))}
        </Text>
      ) : null}

      {parts.status || parts.award ? (
        <Flex as="ul" listStyleType="none" m={0} mt={2.5} p={0} gap={2} wrap="wrap">
          {parts.status ? (
            <Box
              as="li"
              fontFamily={MONO}
              fontSize="11px"
              letterSpacing="0.06em"
              textTransform={lang === 'en' ? 'uppercase' : undefined}
              lineHeight="20px"
              px={2}
              borderRadius="full"
              bg="var(--accent-soft)"
              color="accent.text"
            >
              {parts.status}
            </Box>
          ) : null}
          {parts.award ? (
            <Flex
              as="li"
              align="center"
              gap="5px"
              fontSize="12.5px"
              lineHeight="20px"
              px={2}
              borderRadius="full"
              border="1px solid"
              borderColor="page.border-strong"
              color="page.fg"
              lang={textLang(parts.award, pageLang)}
            >
              <Box as="span" color="accent.text" display="inline-flex">
                <StarIcon size="xs" fill="currentColor" />
              </Box>
              {parts.award}
            </Flex>
          ) : null}
        </Flex>
      ) : null}

      {links.length || hasAbstract || actions ? (
        <Flex mt={3} gap={2} wrap="wrap" align="center">
          {links}
          {hasAbstract ? (
            <Box
              as="button"
              type="button"
              {...pillProps}
              borderColor={open ? 'var(--accent)' : pillProps.borderColor}
              color={open ? 'accent.text' : pillProps.color}
              aria-expanded={open}
              aria-controls={panelId}
              onClick={() => setOpen((v) => !v)}
            >
              {ABSTRACT[lang]}
              <Chevron open={open} />
            </Box>
          ) : null}
          {actions}
        </Flex>
      ) : null}

      {hasAbstract ? (
        <Collapse open={open} id={panelId}>
          <Box
            mt={3}
            pl={4}
            borderLeft="2px solid"
            borderColor="page.border-strong"
            maxW="72ch"
          >
            {pub.abstract
              ? pub.abstract.split(/\n{2,}/).map((para, i) => (
                  <Text key={i} fontSize={body} lineHeight="1.7" color="page.fg" mt={i ? 3 : 0} whiteSpace="pre-line" lang={textLang(para, pageLang)}>
                    {para}
                  </Text>
                ))
              : null}
            {pub.keywords.length ? (
              <Text fontSize="13px" color="page.fg-secondary" mt={pub.abstract ? 3 : 0}>
                <Text as="span" fontFamily={MONO} fontSize="11px" letterSpacing="0.08em" textTransform={lang === 'en' ? 'uppercase' : undefined} mr={2}>
                  {KEYWORDS[lang]}
                </Text>
                <span lang={textLang(pub.keywords.join(' '), pageLang)}>{pub.keywords.join(lang === 'zh' ? '，' : ', ')}</span>
              </Text>
            ) : null}
          </Box>
        </Collapse>
      ) : null}
    </Box>
  )
}
