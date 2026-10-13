import { Box, Button, Flex, IconButton, List, ListItem, SimpleGrid, Skeleton, Text } from '@chakra-ui/react'
import { AddIcon, DeleteIcon } from '@chakra-ui/icons'
import { HOME_LIMITS, isHighlightHref } from '../../../lib/homeShape'
import type { HighlightSuggestion } from '../../../lib/highlights'
import SortableList, { SortableHandle } from '../shell/SortableList'
import { MONO, outlineButtonProps } from '../shell/ui'
import { hasHighlight, moveItem, newId, type HighlightItem } from './homeForm'
import { TextField, useUndoableRemove, type SectionProps } from './ImageCards'

/** Characters left (negative when over), shown next to the field label. */
function Counter({ value, max }: { value: string; max: number }) {
  const left = max - value.trim().length
  return (
    <Text
      as="span"
      fontSize="10px"
      fontFamily={MONO}
      className="tnum"
      color={left < 0 ? 'red.600' : 'page.fg-secondary'}
      _dark={left < 0 ? { color: 'red.300' } : undefined}
    >
      {left}
    </Text>
  )
}

const hrefProblem = (href: string) =>
  href.trim() && !isHighlightHref(href) ? 'Use a site path such as /cv#cv-education-0, or a full https:// URL.' : undefined

/**
 * Proof-strip highlights: up to four tiles under the home hero, each with a
 * headline, a one-line description and the link to where it comes from.
 * Nothing shows on the site until at least one is saved.
 *
 * `suggestions` come from GET /api/admin/cv-derived: tiles built verbatim from
 * the public CV (awards, patents, education) with their CV links. "Add" only
 * copies one into the form; the owner can reword it before saving.
 */
export default function HighlightsSection({
  value,
  onChange,
  suggestions,
}: SectionProps<HighlightItem[]> & {
  /** null while loading; [] when the CV offers nothing. */
  suggestions: HighlightSuggestion[] | null
}) {
  const remove = useUndoableRemove(onChange, 'highlight')
  const patch = (id: string, change: Partial<HighlightItem>) =>
    onChange((prev) => prev.map((h) => (h._id === id ? { ...h, ...change } : h)))
  const full = value.length >= HOME_LIMITS.highlightsMax
  const add = (h?: HighlightSuggestion) =>
    onChange((prev) =>
      prev.length >= HOME_LIMITS.highlightsMax ? prev : [...prev, { _id: newId(), value: h?.value ?? '', label: h?.label ?? '', href: h?.href ?? '' }],
    )
  const offered = (suggestions || []).filter((s) => !hasHighlight(value, s))

  return (
    <Box>
      {value.length === 0 ? (
        <Text fontSize="sm" color="page.fg-secondary" mb={3}>
          No highlights. The strip stays hidden on the home page until you add one.
        </Text>
      ) : (
        <SortableList
          items={value}
          getId={(h) => h._id}
          itemNoun="highlight"
          ariaLabel="Highlights, in display order"
          spacing={2}
          onReorder={(from, to) => onChange((prev) => moveItem(prev, from, to))}
          renderItem={(h, { index }) => (
            <Flex align="flex-start" gap={2} p={2.5} border="1px solid" borderColor="page.border" borderRadius="lg" bg="page.bg">
              <Box pt={5}>
                <SortableHandle label={`Reorder highlight ${index + 1}`} />
              </Box>
              <SimpleGrid columns={{ base: 1, md: 3 }} gap={2} flex={1} minW={0}>
                <TextField
                  label={`Headline ${index + 1}`}
                  value={h.value}
                  onChange={(v) => patch(h._id, { value: v })}
                  placeholder="18th worldwide"
                  extra={<Counter value={h.value} max={HOME_LIMITS.highlightValueMax} />}
                />
                <TextField
                  label="What it is"
                  value={h.label}
                  onChange={(v) => patch(h._id, { label: v })}
                  placeholder="IEEEXtreme 19.0, global programming contest"
                  extra={<Counter value={h.label} max={HOME_LIMITS.highlightLabelMax} />}
                />
                <TextField
                  label="Source link"
                  value={h.href}
                  onChange={(v) => patch(h._id, { href: v })}
                  placeholder="/cv#cv-competitionAwards-0"
                  invalid={hrefProblem(h.href)}
                />
              </SimpleGrid>
              <IconButton
                aria-label={`Remove highlight ${index + 1}`}
                size="sm"
                variant="ghost"
                color="page.fg-secondary"
                _hover={{ color: 'red.500', bg: 'page.bg-overlay' }}
                icon={<DeleteIcon />}
                onClick={() => remove(value, index)}
                mt={5}
              />
            </Flex>
          )}
        />
      )}
      <Flex mt={3} gap={3} align="center" flexWrap="wrap">
        <Button size="sm" {...outlineButtonProps} leftIcon={<AddIcon boxSize={2.5} />} onClick={() => add()} isDisabled={full}>
          Add highlight
        </Button>
        <Text fontSize="xs" color="page.fg-secondary">
          {full ? `That’s the maximum of ${HOME_LIMITS.highlightsMax}.` : `Up to ${HOME_LIMITS.highlightsMax}; three or four read best.`}
        </Text>
      </Flex>

      <Box mt={5} border="1px dashed" borderColor="page.border-strong" borderRadius="lg" px={4} py={3} role="region" aria-label="Suggestions from your CV">
        <Text fontSize="sm" fontWeight={600}>
          Suggestions from your public CV
        </Text>
        <Text fontSize="xs" color="page.fg-secondary" mt={0.5}>
          Exact wording from your awards, patents and education, linked to the CV entry. Adding one fills a tile you can still edit; nothing is
          published until you save.
        </Text>
        {suggestions === null ? (
          <Skeleton h="40px" mt={3} borderRadius="md" />
        ) : offered.length === 0 ? (
          <Text fontSize="xs" color="page.fg-secondary" mt={3}>
            {suggestions.length ? 'All suggestions are in your list.' : 'Nothing to suggest: the public CV has no awards, patents or education entries.'}
          </Text>
        ) : (
          <List mt={3} spacing={2} aria-label="Suggested highlights">
            {offered.map((s) => (
              <ListItem key={`${s.href}|${s.value}`}>
                <Flex align="center" gap={3} p={2.5} border="1px solid" borderColor="page.border" borderRadius="md" bg="page.bg" flexWrap="wrap">
                  <Box flex="1 1 240px" minW={0}>
                    <Text fontSize="sm" fontWeight={600}>
                      {s.value}
                    </Text>
                    <Text fontSize="xs" color="page.fg-secondary">
                      {s.label}
                    </Text>
                    <Text fontSize="10px" fontFamily={MONO} color="page.fg-secondary" mt={0.5}>
                      {s.source} · {s.href}
                    </Text>
                  </Box>
                  <Button size="xs" {...outlineButtonProps} onClick={() => add(s)} isDisabled={full} aria-label={`Add highlight: ${s.value}`}>
                    Add
                  </Button>
                </Flex>
              </ListItem>
            ))}
          </List>
        )}
      </Box>
    </Box>
  )
}
