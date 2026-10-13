import { useId } from 'react'
import { Box, Button, Flex, IconButton, Input, Text } from '@chakra-ui/react'
import { inputProps, MONO, outlineButtonProps, warnTextProps } from './ui'
import { LINK_EMPTY, OUTCOME_EMPTY, type LinkForm, type OutcomeForm } from './itemFrontmatter'
import { LINKS_MAX, OUTCOME_LIMITS, OUTCOMES_MAX, outcomeText, safeCaseStudyUrl } from '../../../lib/caseStudy'

/**
 * "At a glance" editors of the case-study form (D1): up to four metrics —
 * value, unit, what was measured and where the number comes from (with an
 * optional evidence link) — and up to four extra links. Rows can be added,
 * removed and reordered with labelled buttons; each input has its own
 * accessible name ("Metric 2 — value"). A preview line shows how a metric
 * reads on the page; a half-filled row is kept but marked (the page shows
 * complete rows only).
 */

function move<T>(list: T[], from: number, to: number): T[] {
  if (to < 0 || to >= list.length) return list
  const next = [...list]
  const [item] = next.splice(from, 1)
  next.splice(to, 0, item)
  return next
}

const Arrow = ({ up }: { up: boolean }) => (
  <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden focusable="false">
    <path d={up ? 'm6 15 6-6 6 6' : 'm6 9 6 6 6-6'} />
  </svg>
)
const Cross = () => (
  <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden focusable="false">
    <path d="M18 6 6 18M6 6l12 12" />
  </svg>
)

function RowControls({ index, count, noun, onMove, onRemove }: { index: number; count: number; noun: string; onMove: (to: number) => void; onRemove: () => void }) {
  const n = index + 1
  return (
    <Flex gap={1} flexShrink={0}>
      <IconButton size="sm" variant="ghost" aria-label={`Move ${noun} ${n} up`} icon={<Arrow up />} isDisabled={index === 0} onClick={() => onMove(index - 1)} />
      <IconButton size="sm" variant="ghost" aria-label={`Move ${noun} ${n} down`} icon={<Arrow up={false} />} isDisabled={index === count - 1} onClick={() => onMove(index + 1)} />
      <IconButton size="sm" variant="ghost" aria-label={`Remove ${noun} ${n}`} icon={<Cross />} onClick={onRemove} color="page.fg-secondary" />
    </Flex>
  )
}

export function OutcomesField({ value, onChange }: { value: OutcomeForm[]; onChange: (rows: OutcomeForm[]) => void }) {
  const id = useId()
  const set = (i: number, patch: Partial<OutcomeForm>) => onChange(value.map((r, j) => (j === i ? { ...r, ...patch } : r)))
  return (
    <Box role="group" aria-labelledby={`${id}-label`}>
      <Text id={`${id}-label`} fontSize="13px" fontWeight={500} mb={1}>
        Metrics <Text as="span" color="page.fg-secondary" fontWeight={400}>(up to {OUTCOMES_MAX})</Text>
      </Text>
      <Text fontSize="xs" color="page.fg-secondary" mb={3}>
        Numbers you measured, shown large under the title. Only rows with a value and a label appear on the page.
      </Text>
      <Flex direction="column" gap={3}>
        {value.map((row, i) => {
          const n = i + 1
          const partial = (!!row.value.trim() || !!row.label.trim()) && !(row.value.trim() && row.label.trim())
          const badUrl = !!row.sourceUrl.trim() && !safeCaseStudyUrl(row.sourceUrl)
          return (
            <Box key={i} border="1px solid" borderColor={partial ? 'orange.300' : 'page.border'} borderRadius="md" p={3}>
              <Flex gap={2} align="flex-start" wrap={{ base: 'wrap', md: 'nowrap' }}>
                <Input {...inputProps} size="sm" w={{ base: 'calc(50% - 4px)', md: '110px' }} aria-label={`Metric ${n} — value`} placeholder="93.59" value={row.value} maxLength={OUTCOME_LIMITS.value} onChange={(e) => set(i, { value: e.target.value })} fontFamily={MONO} />
                <Input {...inputProps} size="sm" w={{ base: 'calc(50% - 4px)', md: '80px' }} aria-label={`Metric ${n} — unit`} placeholder="%" value={row.unit} maxLength={OUTCOME_LIMITS.unit} onChange={(e) => set(i, { unit: e.target.value })} fontFamily={MONO} />
                <Input {...inputProps} size="sm" flex="1" minW={{ base: '100%', md: 0 }} aria-label={`Metric ${n} — what was measured`} placeholder="What was measured" value={row.label} maxLength={OUTCOME_LIMITS.label} onChange={(e) => set(i, { label: e.target.value })} />
                <RowControls index={i} count={value.length} noun="metric" onMove={(to) => onChange(move(value, i, to))} onRemove={() => onChange(value.filter((_, j) => j !== i))} />
              </Flex>
              <Flex gap={2} mt={2} wrap={{ base: 'wrap', md: 'nowrap' }}>
                <Input {...inputProps} size="sm" flex="1" minW={{ base: '100%', md: 0 }} aria-label={`Metric ${n} — source`} placeholder="Source (test run, benchmark, users…)" value={row.source} maxLength={OUTCOME_LIMITS.source} onChange={(e) => set(i, { source: e.target.value })} />
                <Input
                  {...inputProps}
                  size="sm"
                  flex="1"
                  minW={{ base: '100%', md: 0 }}
                  type="text"
                  inputMode="url"
                  aria-label={`Metric ${n} — evidence link`}
                  placeholder="Evidence link: https://… or #results"
                  value={row.sourceUrl}
                  onChange={(e) => set(i, { sourceUrl: e.target.value })}
                  aria-invalid={badUrl}
                />
              </Flex>
              <Text fontSize="xs" mt={2} {...(partial || badUrl ? warnTextProps : { color: 'page.fg-secondary' })} className="tnum">
                {partial
                  ? 'Add both a value and a label — incomplete rows are not shown.'
                  : badUrl
                    ? 'The evidence link must be https://…, a /path or a #section.'
                    : row.value.trim() && row.label.trim()
                      ? `Reads: ${outcomeText({ value: row.value.trim(), unit: row.unit.trim() || undefined })} · ${row.label.trim()}${row.source.trim() ? ` · ${row.source.trim()}` : ''}`
                      : 'Empty rows are ignored.'}
              </Text>
            </Box>
          )
        })}
      </Flex>
      <Button mt={3} size="xs" {...outlineButtonProps} onClick={() => onChange([...value, { ...OUTCOME_EMPTY }])} isDisabled={value.length >= OUTCOMES_MAX}>
        Add metric
      </Button>
    </Box>
  )
}

export function LinksField({ value, onChange }: { value: LinkForm[]; onChange: (rows: LinkForm[]) => void }) {
  const id = useId()
  const set = (i: number, patch: Partial<LinkForm>) => onChange(value.map((r, j) => (j === i ? { ...r, ...patch } : r)))
  return (
    <Box role="group" aria-labelledby={`${id}-label`}>
      <Text id={`${id}-label`} fontSize="13px" fontWeight={500} mb={1}>
        More links <Text as="span" color="page.fg-secondary" fontWeight={400}>(up to {LINKS_MAX})</Text>
      </Text>
      <Text fontSize="xs" color="page.fg-secondary" mb={3}>
        Shown next to Visit site and Source: a demo video, a paper, slides.
      </Text>
      <Flex direction="column" gap={2}>
        {value.map((row, i) => {
          const n = i + 1
          const badUrl = !!row.url.trim() && (!safeCaseStudyUrl(row.url) || row.url.trim().startsWith('#'))
          return (
            <Box key={i}>
              <Flex gap={2} align="center" wrap={{ base: 'wrap', md: 'nowrap' }}>
                <Input {...inputProps} size="sm" w={{ base: '100%', md: '180px' }} aria-label={`Link ${n} — label`} placeholder="Demo video" value={row.label} maxLength={40} onChange={(e) => set(i, { label: e.target.value })} />
                <Input {...inputProps} size="sm" flex="1" minW={0} inputMode="url" aria-label={`Link ${n} — URL`} placeholder="https://…" value={row.url} onChange={(e) => set(i, { url: e.target.value })} aria-invalid={badUrl} />
                <RowControls index={i} count={value.length} noun="link" onMove={(to) => onChange(move(value, i, to))} onRemove={() => onChange(value.filter((_, j) => j !== i))} />
              </Flex>
              {badUrl ? (
                <Text fontSize="xs" {...warnTextProps} mt={1}>
                  Use an https:// address or a /path on this site.
                </Text>
              ) : null}
            </Box>
          )
        })}
      </Flex>
      <Button mt={3} size="xs" {...outlineButtonProps} onClick={() => onChange([...value, { ...LINK_EMPTY }])} isDisabled={value.length >= LINKS_MAX}>
        Add link
      </Button>
    </Box>
  )
}
