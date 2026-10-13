import NextLink from 'next/link'
import { Box, Flex, Link, Text } from '@chakra-ui/react'
import type { ArchiveRow } from '../../lib/projectArchive'
import { labelLang } from '../../lib/toc'
import { tagSlugList } from '../../lib/tagFilter'

/**
 * "All projects" on /work (E8): every project of the public CV, newest
 * first — a real table from md up (year, project + summary, role, stack,
 * links), stacked cards on phones. Rows with a case study link to it.
 * A column no project fills yet (role, stack, links — optional CV fields)
 * is left out rather than shown as a column of dashes; `columns` is decided
 * over the whole archive, so filtering never adds or removes one.
 * Rows carry `data-tag-item` / `data-tag-slugs` for the shared tag filter.
 */

export type ArchiveColumns = { role: boolean; stack: boolean; links: boolean }

/** Which optional columns any of the rows fills. */
export function archiveColumns(rows: readonly ArchiveRow[]): ArchiveColumns {
  return {
    role: rows.some((r) => !!r.role),
    stack: rows.some((r) => r.stack.length > 0),
    links: rows.some((r) => !!r.caseStudy || r.links.length > 0),
  }
}

const MONO = 'var(--font-geist-mono), monospace'

const LINK_LABEL = { site: 'Live', repo: 'Code' } as const

function Years({ row }: { row: ArchiveRow }) {
  if (!row.years) return <span aria-label="No dates">—</span>
  return <span className="tnum">{row.years}</span>
}

function Links({ row }: { row: ArchiveRow }) {
  if (!row.caseStudy && !row.links.length) return <Box as="span" color="page.fg-subtle" aria-label="No links">—</Box>
  return (
    <Flex as="span" gap={3} wrap="wrap" rowGap={1}>
      {row.caseStudy ? (
        <Link as={NextLink} href={row.caseStudy.permalink} color="accent.text" className="link-underline" whiteSpace="nowrap">
          Case study
          <span className="sr-only">: {row.caseStudy.title}</span> <span aria-hidden>→</span>
        </Link>
      ) : null}
      {row.links.map((l) => (
        <Link key={l.kind} href={l.url} isExternal color="accent.text" className="link-underline" whiteSpace="nowrap">
          {LINK_LABEL[l.kind]}
          <span className="sr-only">
            {' '}
            — {row.title} (opens in a new tab)
          </span>{' '}
          <span className="nudge-ne" aria-hidden>
            ↗
          </span>
        </Link>
      ))}
    </Flex>
  )
}

function Stack({ items }: { items: string[] }) {
  if (!items.length) return <Box as="span" color="page.fg-subtle" aria-label="Not listed">—</Box>
  return (
    <Flex as="ul" listStyleType="none" m={0} p={0} gap={1.5} wrap="wrap" aria-label="Stack">
      {items.map((t) => (
        <Box as="li" key={t} lang={labelLang(t)} fontFamily={MONO} fontSize="11px" lineHeight="1.4" px={2} py={0.5} borderRadius="full" border="1px solid" borderColor="page.border-strong" color="page.fg-secondary">
          {t}
        </Box>
      ))}
    </Flex>
  )
}

/** Every table style lives here (see the note in the table): cells, header, column widths. */
const tableSx = {
  borderCollapse: 'collapse',
  tableLayout: 'fixed',
  'th, td': { py: 4, pr: 5, verticalAlign: 'top', borderBottom: '1px solid', borderColor: 'page.border', fontSize: '14px', textAlign: 'left' },
  'th:last-child, td:last-child': { pr: 0 },
  'thead tr': { borderTop: '1px solid', borderColor: 'page.border' },
  'thead th': { py: 3, fontFamily: MONO, fontSize: '11px', fontWeight: 400, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'page.fg-subtle' },
  'tbody th': { fontWeight: 400 },
  'td.cell-years': { fontFamily: MONO, fontSize: '12px', color: 'page.fg-secondary', pt: '1.1rem' },
  'td.cell-empty': { color: 'page.fg-subtle' },
  'col.col-years': { width: '7.5rem' },
  'col.col-role': { width: { md: '9rem', lg: '11rem' } },
  'col.col-stack': { width: { md: '12rem', lg: '15rem' } },
  'col.col-links': { width: '8.5rem' },
} as const

export default function ProjectArchive({
  rows,
  total,
  emptyNote,
  columns = archiveColumns(rows),
}: {
  rows: ArchiveRow[]
  total: number
  emptyNote?: string
  /** Optional columns to show (default: those the given rows fill). */
  columns?: ArchiveColumns
}) {
  if (!total) return null
  return (
    <Box as="section" aria-labelledby="archive-heading" mt={{ base: 16, md: 24 }}>
      <Flex align="baseline" justify="space-between" gap={4} mb={2}>
        <Text as="h2" id="archive-heading" fontSize={{ base: '22px', md: '24px' }} fontWeight={500} letterSpacing="-0.02em" color="page.fg" m={0}>
          All projects
        </Text>
        <Text as="span" fontFamily={MONO} fontSize="11px" color="page.fg-secondary" className="tnum">
          {total} from the CV
        </Text>
      </Flex>
      <Text fontSize="14px" color="page.fg-secondary" mb={6} maxW="62ch">
        Every project on my CV, newest first. Those with a write-up link to their case study.
      </Text>

      {rows.length === 0 && emptyNote ? (
        <Text fontFamily={MONO} fontSize="12px" color="page.fg-secondary" py={6} borderTop="1px solid" borderColor="page.border">
          {emptyNote}
        </Text>
      ) : null}

      {/* md and up: a table. Plain table elements styled from the table's own sx:
          Emotion writes a <style> before every styled element, and one between
          <tbody> and <tr> would be moved out by the HTML parser (hydration mismatch). */}
      <Box display={{ base: 'none', md: 'block' }}>
        <Box as="table" w="100%" sx={tableSx}>
          <caption className="sr-only">All projects from the CV, newest first</caption>
          <colgroup>
            <col className="col-years" />
            <col />
            {columns.role ? <col className="col-role" /> : null}
            {columns.stack ? <col className="col-stack" /> : null}
            {columns.links ? <col className="col-links" /> : null}
          </colgroup>
          <thead>
            <tr>
              <th scope="col">Years</th>
              <th scope="col">Project</th>
              {columns.role ? <th scope="col">Role</th> : null}
              {columns.stack ? <th scope="col">Built with</th> : null}
              {columns.links ? <th scope="col">Links</th> : null}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.key} data-tag-item="" data-tag-slugs={tagSlugList(row.stack)} className="archive-row">
                <td className="cell-years">
                  <Years row={row} />
                </td>
                <th scope="row" className="cell-title">
                  <Text as="span" display="block" fontWeight={500} color="page.fg" fontSize="15px" lang={labelLang(row.title)}>
                    {row.title}
                  </Text>
                  {row.summary ? (
                    <Text as="span" display="block" mt={1} color="page.fg-secondary" fontSize="13px" lineHeight="1.55" noOfLines={2} lang={labelLang(row.summary)}>
                      {row.summary}
                    </Text>
                  ) : null}
                </th>
                {columns.role ? <td className={row.role ? undefined : 'cell-empty'}>{row.role || <span aria-label="Not listed">—</span>}</td> : null}
                {columns.stack ? (
                  <td>
                    <Stack items={row.stack} />
                  </td>
                ) : null}
                {columns.links ? (
                  <td>
                    <Links row={row} />
                  </td>
                ) : null}
              </tr>
            ))}
          </tbody>
        </Box>
      </Box>

      {/* phones: cards */}
      <Box as="ul" display={{ base: 'block', md: 'none' }} listStyleType="none" m={0} p={0} borderTop="1px solid" borderColor="page.border">
        {rows.map((row) => (
          <Box as="li" key={row.key} data-tag-item="" data-tag-slugs={tagSlugList(row.stack)} py={5} borderBottom="1px solid" borderColor="page.border">
            <Flex justify="space-between" gap={3} fontFamily={MONO} fontSize="11px" color="page.fg-secondary" mb={1.5}>
              <Years row={row} />
              {row.role ? (
                <Text as="span" noOfLines={1} textAlign="right">
                  {row.role}
                </Text>
              ) : null}
            </Flex>
            <Text as="h3" fontSize="16px" fontWeight={500} color="page.fg" m={0} lang={labelLang(row.title)}>
              {row.title}
            </Text>
            {row.summary ? (
              <Text fontSize="14px" color="page.fg-secondary" mt={1.5} lineHeight="1.55" lang={labelLang(row.summary)}>
                {row.summary}
              </Text>
            ) : null}
            {row.stack.length ? (
              <Box mt={3}>
                <Stack items={row.stack} />
              </Box>
            ) : null}
            {row.caseStudy || row.links.length ? (
              <Box mt={3} fontSize="14px">
                <Links row={row} />
              </Box>
            ) : null}
          </Box>
        ))}
      </Box>
    </Box>
  )
}
