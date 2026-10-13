import React from 'react'
import { Box, Flex, Link, Text } from '@chakra-ui/react'
import type { CvLang } from '../../lib/cvVisibility'
import { useReferenceMonth } from '../../lib/clock'
import { cvLabels, displayUrl, formatCvDate, majorAddsInfo, safeHref } from '../../lib/cvFormat'
import { profileLinks, projectLinks } from '../../lib/cvLinks'
import EmailText from '../Common/EmailText'
import { composeName } from './cvName'
import { SkillName, skillLinkLabel, useSkillLinkId } from './evidence'
import { ANCHOR_SCROLL_MARGIN } from './primitives'
import {
  bullets,
  certificateValidity,
  cvEntryAnchor,
  cvSectionAnchor,
  entries,
  entryRange,
  field,
  graduation,
  indexedCertificates,
  indexedList,
  joinParts,
  labelled,
  list,
} from './fields'

/**
 * Reflowed "Reading" view of the CV for phones: the same public 'cv' data as
 * the A4 sheet, laid out as one card per section with comfortable body type
 * (15–16px) instead of a zoomed-out page. Never printed — print always uses
 * the A4 sheet (the wrapper on /cv carries .no-print).
 *
 * Every value goes through ./fields, so hidden fields, entries and bullets
 * stay hidden and no label or separator is left behind for them.
 *
 * Anchors: the A4 sheet owns the `cv-<sessionName>[-<index>]` ids (both
 * views are in the DOM, ids must be unique); the same values are set here as
 * `data-cv-anchor`, and the /cv page scrolls to them when the sheet is the
 * hidden view (CvPageView). The name is a paragraph — the page h1 is the
 * PageHeader — and section cards are the h2s.
 *
 * Evidence: GitHub / LinkedIn sit with the contacts, projects list their
 * case study / live / code links (lib/cvLinks), and skills with evidence
 * link to their row in the page's skill evidence index (./evidence).
 */

const mono = 'var(--font-geist-mono), ui-monospace, monospace'

type Section = { sessionName?: string; headerName?: string; [k: string]: any }

export default function ReadingView({ sections, lang }: { sections: Section[]; lang: CvLang }) {
  const month = useReferenceMonth()
  const visible = entries(sections).filter((s) => s.isVisible !== false)
  return (
    <Flex direction="column" gap={4} lang={lang === 'zh' ? 'zh-Hans' : 'en'}>
      {visible.map((section, i) => {
        if (section.sessionName === 'personalInformation') {
          return <IdentityCard key={`pi-${i}`} data={section} lang={lang} />
        }
        const body = renderBody(section, lang, month)
        if (!body) return null
        const name = String(section.sessionName || i)
        return (
          <Card
            key={name}
            headingId={`cv-read-${name}`}
            anchor={cvSectionAnchor(name)}
            title={field(section, 'headerName') || name}
          >
            {body}
          </Card>
        )
      })}
    </Flex>
  )
}

// ── Layout pieces ─────────────────────────────────────────────────────────

function Card({
  headingId,
  anchor,
  title,
  children,
}: {
  headingId: string
  anchor: string
  title: string
  children: React.ReactNode
}) {
  return (
    <Box
      as="section"
      aria-labelledby={headingId}
      data-cv-anchor={anchor}
      sx={{ scrollMarginTop: ANCHOR_SCROLL_MARGIN }}
      border="1px solid"
      borderColor="page.border"
      borderRadius="12px"
      bg="page.bg-elevated"
      px={{ base: 4, sm: 5 }}
      py={{ base: 4, sm: 5 }}
    >
      <Text
        as="h2"
        id={headingId}
        fontFamily={mono}
        fontSize="11px"
        letterSpacing="0.12em"
        textTransform="uppercase"
        color="page.fg-secondary"
        mb={3}
      >
        {title}
      </Text>
      {children}
    </Box>
  )
}

/** Entries separated by hairlines; each carries its entry anchor. */
function Entries({ items }: { items: Array<{ anchor: string; node: React.ReactNode }> }) {
  if (!items.length) return null
  return (
    <Box as="ul" listStyleType="none" m={0} p={0}>
      {items.map((it, i) => (
        <Box
          as="li"
          key={it.anchor}
          data-cv-anchor={it.anchor}
          py={3}
          borderTop={i === 0 ? undefined : '1px solid'}
          borderColor="page.border"
          sx={{ scrollMarginTop: ANCHOR_SCROLL_MARGIN }}
        >
          {it.node}
        </Box>
      ))}
    </Box>
  )
}

function Entry({
  title,
  subtitle,
  meta,
  children,
}: {
  title?: React.ReactNode
  subtitle?: React.ReactNode
  meta?: string
  children?: React.ReactNode
}) {
  return (
    <Box>
      {title ? (
        <Text as="h3" fontSize={{ base: '16px', sm: '17px' }} fontWeight={600} lineHeight="1.35" color="page.fg">
          {title}
        </Text>
      ) : null}
      {subtitle ? (
        <Text fontSize={{ base: '15px', sm: '16px' }} lineHeight="1.5" color="page.fg-secondary" mt={0.5}>
          {subtitle}
        </Text>
      ) : null}
      {meta ? (
        <Text fontFamily={mono} fontSize="12px" letterSpacing="0.02em" color="page.fg-secondary" mt={1}>
          {meta}
        </Text>
      ) : null}
      {children}
    </Box>
  )
}

function Body({ children }: { children: string }) {
  if (!children) return null
  return (
    <Text fontSize={{ base: '15px', sm: '16px' }} lineHeight="1.65" color="page.fg" mt={2}>
      {children}
    </Text>
  )
}

function Bullets({ items }: { items: Array<{ text: string; sub?: string[]; node?: React.ReactNode }> }) {
  if (!items.length) return null
  return (
    <Box as="ul" mt={2} pl="1.1em" fontSize={{ base: '15px', sm: '16px' }} lineHeight="1.65" color="page.fg">
      {items.map((b, i) => (
        <Box
          as="li"
          key={i}
          mt={i ? 1 : 0}
          listStyleType={b.text ? undefined : 'none'}
          sx={{ '&::marker': { color: 'var(--accent)' } }}
        >
          {b.node ?? b.text}
          {b.sub && b.sub.length ? (
            <Box as="ul" pl="1.1em" mt={1} color="page.fg-secondary" listStyleType="circle">
              {b.sub.map((s, j) => (
                <Box as="li" key={j}>
                  {s}
                </Box>
              ))}
            </Box>
          ) : null}
        </Box>
      ))}
    </Box>
  )
}

function features(node: unknown) {
  return list(node, 'features')
    .map((f) => ({ text: field(f, 'description'), sub: bullets(f, 'furtherExplanation') }))
    .filter((f) => f.text || f.sub.length)
}

const chipSx = {
  fontFamily: mono,
  fontSize: '11px',
  lineHeight: '1.4',
  px: 2,
  py: 0.5,
  border: '1px solid',
  borderColor: 'page.border-strong',
  borderRadius: 'full',
  color: 'page.fg-secondary',
} as const

/** A related-skill chip; with evidence on the page it links to the skill's evidence row. */
function Chip({ name, lang }: { name: string; lang: CvLang }) {
  const id = useSkillLinkId(name)
  if (!id) return <Box sx={chipSx}>{name}</Box>
  return (
    <Box
      as="a"
      href={`#${id}`}
      aria-label={skillLinkLabel(name, lang)}
      display="inline-block"
      sx={chipSx}
      color="page.fg"
      _hover={{ borderColor: 'var(--accent)', color: 'accent.text' }}
      _focusVisible={{ outline: '2px solid var(--accent)', outlineOffset: '2px' }}
    >
      {name}
    </Box>
  )
}

function Chips({ items, lang }: { items: string[]; lang: CvLang }) {
  if (!items.length) return null
  return (
    <Flex as="ul" listStyleType="none" wrap="wrap" gap={1.5} mt={3} p={0}>
      {items.map((s, i) => (
        <Box as="li" key={i}>
          <Chip name={s} lang={lang} />
        </Box>
      ))}
    </Flex>
  )
}

/** Case study / live / code links under a project. */
function ProjectLinkRow({ project, lang }: { project: unknown; lang: CvLang }) {
  const links = projectLinks(project, lang)
  if (!links.length) return null
  return (
    <Flex as="ul" listStyleType="none" wrap="wrap" columnGap={4} rowGap={1} mt={2.5} p={0} fontSize="14px">
      {links.map((l) => (
        <Box as="li" key={l.kind}>
          <Text as="span" fontFamily={mono} fontSize="11px" letterSpacing="0.06em" textTransform="uppercase" color="page.fg-secondary" mr={1.5}>
            {l.label}
          </Text>
          <MaybeLink url={l.path || l.href}>{l.text}</MaybeLink>
        </Box>
      ))}
    </Flex>
  )
}

/** Text that links only when the URL is safe; otherwise plain text. */
function MaybeLink({ url, children }: { url: string; children: React.ReactNode }) {
  const href = safeHref(url)
  if (!href) return <>{children}</>
  return (
    <Link
      href={href}
      isExternal={/^https?:/i.test(href)}
      color="accent.text"
      textDecoration="underline"
      textUnderlineOffset="3px"
      textDecorationColor="var(--accent-ring)"
      _hover={{ textDecorationColor: 'accent.text' }}
      wordBreak="break-word"
    >
      {children}
    </Link>
  )
}

// ── Identity ──────────────────────────────────────────────────────────────

function IdentityCard({ data, lang }: { data: Section; lang: CvLang }) {
  const { main, aside } = composeName(data as any, lang)
  const website = field(data, 'personalWebsite')
  const email = field(data, 'email')
  const phone = field(data, 'phoneNumber')
  const address = field(data, 'address')
  const intro = field(data, 'introduction')
  const L = cvLabels(lang)
  const contacts: Array<{ label: string; node: React.ReactNode }> = []
  if (website) contacts.push({ label: lang === 'zh' ? '网站' : 'Web', node: <MaybeLink url={website}>{displayUrl(website)}</MaybeLink> })
  if (email) contacts.push({ label: L.email, node: <MaybeLink url={`mailto:${email}`}><EmailText value={email} /></MaybeLink> })
  if (phone) contacts.push({ label: L.phone, node: <MaybeLink url={`tel:${phone.replace(/[^\d+]/g, '')}`}><EmailText value={phone} /></MaybeLink> })
  for (const p of profileLinks(data)) contacts.push({ label: p.label, node: <MaybeLink url={p.href}>{p.text}</MaybeLink> })
  if (address) contacts.push({ label: lang === 'zh' ? '地址' : 'Based in', node: address })
  if (!main && !aside && !contacts.length && !intro) return null

  return (
    <Box
      as="section"
      aria-label={lang === 'zh' ? '个人信息' : 'Personal information'}
      data-cv-anchor={cvSectionAnchor('personalInformation')}
      pb={1}
      sx={{ scrollMarginTop: ANCHOR_SCROLL_MARGIN }}
    >
      {main || aside ? (
        <Text fontSize={{ base: '26px', sm: '30px' }} fontWeight={500} letterSpacing="-0.02em" lineHeight="1.15" color="page.fg">
          {main}
          {aside ? (
            <Text as="span" fontSize="0.6em" fontWeight={400} color="page.fg-secondary" ml={2}>
              {aside}
            </Text>
          ) : null}
        </Text>
      ) : null}
      {intro ? (
        <Text fontSize={{ base: '15px', sm: '16px' }} lineHeight="1.65" color="page.fg" mt={3}>
          {intro}
        </Text>
      ) : null}
      {contacts.length ? (
        <Box
          as="dl"
          display="grid"
          gridTemplateColumns="max-content minmax(0, 1fr)"
          columnGap={4}
          rowGap={1.5}
          mt={4}
          fontSize={{ base: '15px', sm: '16px' }}
          lineHeight="1.5"
        >
          {contacts.map((c) => (
            <React.Fragment key={c.label}>
              <Text as="dt" fontFamily={mono} fontSize="11px" letterSpacing="0.08em" textTransform="uppercase" color="page.fg-secondary" pt="3px">
                {c.label}
              </Text>
              <Text as="dd" m={0} color="page.fg" minW={0}>
                {c.node}
              </Text>
            </React.Fragment>
          ))}
        </Box>
      ) : null}
    </Box>
  )
}

// ── Section bodies ────────────────────────────────────────────────────────

/** `month` is the page's reference month (lib/clock.ts) for "Expected" / "Present". */
function renderBody(section: Section, lang: CvLang, month: string): React.ReactNode {
  const L = cvLabels(lang)
  const dot = ' · '
  switch (section.sessionName) {
    case 'education': {
      const items = indexedList(section, 'educationExperience').filter(
        ({ item: e }) => field(e, 'schoolName') || field(e, 'degree') || field(e, 'major'),
      )
      if (!items.length) return null
      return (
        <Entries
          items={items.map(({ item: e, index }) => {
            const degree = field(e, 'degree')
            const major = majorAddsInfo(degree, field(e, 'major')) ? field(e, 'major') : ''
            const title = joinParts([degree, major], lang === 'zh' ? ' · ' : ', ')
            const school = joinParts([field(e, 'schoolName'), field(e, 'schoolLocation')], ', ')
            const when = joinParts([formatCvDate(field(e, 'startDate'), lang), graduation(e, lang, month)], ' – ')
            const gpa = labelled(L.gpa, field(e, 'gpa'), lang)
            return {
              anchor: cvEntryAnchor('education', index),
              node: (
                <Entry title={title || school} subtitle={title ? school : ''} meta={when}>
                  {gpa ? <Body>{gpa}</Body> : null}
                </Entry>
              ),
            }
          })}
        />
      )
    }
    case 'workExperience': {
      const items = indexedList(section, 'experiences').filter(
        ({ item: e }) => field(e, 'jobTitle') || field(e, 'companyName') || field(e, 'jobDescription') || features(e).length,
      )
      if (!items.length) return null
      return (
        <Entries
          items={items.map(({ item: e, index }) => {
            const company = field(e, 'companyName')
            const url = field(e, 'companyURL')
            return {
              anchor: cvEntryAnchor('workExperience', index),
              node: (
                <Entry
                  title={field(e, 'jobTitle') || company}
                  subtitle={field(e, 'jobTitle') && company ? url ? <MaybeLink url={url}>{company}</MaybeLink> : company : ''}
                  meta={joinParts([entryRange(e, lang), field(e, 'location')], dot)}
                >
                  <Body>{field(e, 'jobDescription')}</Body>
                  <Bullets items={features(e)} />
                  <Chips items={bullets(e, 'relatedSkills')} lang={lang} />
                </Entry>
              ),
            }
          })}
        />
      )
    }
    case 'project': {
      const items = indexedList(section, 'projectExperience').filter(
        ({ item: p }) => field(p, 'title') || field(p, 'description') || features(p).length,
      )
      if (!items.length) return null
      return (
        <Entries
          items={items.map(({ item: p, index }) => ({
            anchor: cvEntryAnchor('project', index),
            node: (
              <Entry
                title={field(p, 'title')}
                meta={joinParts([entryRange(p, lang, { futureEndAsPresent: true, now: month }), field(p, 'projectLocation')], dot)}
              >
                <Body>{field(p, 'description')}</Body>
                <Bullets items={features(p)} />
                <ProjectLinkRow project={p} lang={lang} />
              </Entry>
            ),
          }))}
        />
      )
    }
    case 'competitionAwards': {
      const items = indexedList(section, 'awards').filter(
        ({ item: a }) => field(a, 'contestName') || field(a, 'award') || bullets(a, 'description').length,
      )
      if (!items.length) return null
      return (
        <Entries
          items={items.map(({ item: a, index }) => ({
            anchor: cvEntryAnchor('competitionAwards', index),
            node: (
              <Entry
                title={field(a, 'contestName') || field(a, 'award')}
                subtitle={joinParts([field(a, 'contestName') ? field(a, 'award') : '', field(a, 'organization')], dot)}
                meta={joinParts([formatCvDate(field(a, 'date'), lang), field(a, 'location')], dot)}
              >
                <Bullets items={bullets(a, 'description').map((text) => ({ text }))} />
              </Entry>
            ),
          }))}
        />
      )
    }
    case 'patents': {
      const items = indexedList(section, 'patentExperience').filter(
        ({ item: p }) => field(p, 'title') || bullets(p, 'patents').length,
      )
      if (!items.length) return null
      return (
        <Entries
          items={items.map(({ item: p, index }) => ({
            anchor: cvEntryAnchor('patents', index),
            node: (
              <Entry
                title={field(p, 'title')}
                subtitle={joinParts([field(p, 'organization'), labelled(L.status, field(p, 'status'), lang)], dot)}
                meta={joinParts([formatCvDate(field(p, 'date'), lang), field(p, 'authority')], dot)}
              >
                <Bullets items={bullets(p, 'patents').map((text) => ({ text }))} />
              </Entry>
            ),
          }))}
        />
      )
    }
    case 'certification': {
      const rows = indexedCertificates(section).filter(({ cert }) => field(cert, 'certificationName'))
      if (!rows.length) return null
      return (
        <Entries
          items={rows.map(({ org, cert, index }) => {
            const url = field(cert, 'credentialURL')
            return {
              anchor: cvEntryAnchor('certification', index),
              node: (
                <Entry
                  title={field(cert, 'certificationName')}
                  subtitle={joinParts(
                    [field(org, 'issuingOrganization'), labelled(L.credentialId, field(cert, 'credentialID'), lang)],
                    dot,
                  )}
                  meta={certificateValidity(cert, lang)}
                >
                  {url ? (
                    <Text fontSize="14px" mt={1.5}>
                      <MaybeLink url={url}>{displayUrl(url)}</MaybeLink>
                    </Text>
                  ) : null}
                </Entry>
              ),
            }
          })}
        />
      )
    }
    case 'skill': {
      const languages = list(section, 'languages').filter((l) => field(l, 'language') || field(l, 'level'))
      const groups = list(section, 'technical').filter((g) => field(g, 'name') || bullets(g, 'description').length)
      if (!languages.length && !groups.length) return null
      return (
        <Flex direction="column" gap={4}>
          {languages.length ? (
            <Box>
              <SubHeading>{L.languages}</SubHeading>
              <Box as="dl" display="grid" gridTemplateColumns="max-content minmax(0, 1fr)" columnGap={4} rowGap={1} fontSize={{ base: '15px', sm: '16px' }} lineHeight="1.5">
                {languages.map((l, i) => (
                  <React.Fragment key={i}>
                    <Text as="dt" fontWeight={600} color="page.fg">
                      <SkillName name={field(l, 'language')} variant="page" />
                    </Text>
                    <Text as="dd" m={0} color="page.fg-secondary">
                      {field(l, 'level')}
                    </Text>
                  </React.Fragment>
                ))}
              </Box>
            </Box>
          ) : null}
          {groups.map((g, i) => (
            <Box key={i}>
              {field(g, 'name') ? <SubHeading>{field(g, 'name')}</SubHeading> : null}
              <Bullets items={bullets(g, 'description').map((text) => ({ text, node: <SkillName name={text} variant="page" /> }))} />
            </Box>
          ))}
        </Flex>
      )
    }
    case 'extraSkill': {
      const points = bullets(section, 'points')
      if (!points.length) return null
      return <Bullets items={points.map((text) => ({ text }))} />
    }
    default:
      return null
  }
}

function SubHeading({ children }: { children: React.ReactNode }) {
  return (
    <Text as="h3" fontSize="15px" fontWeight={600} color="page.fg" mb={1}>
      {children}
    </Text>
  )
}
