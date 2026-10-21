import type { ReactNode } from 'react'
import { Badge, Box, Button, ButtonGroup, Checkbox, Flex, Text } from '@chakra-ui/react'
import {
  DEFAULT_SECTION_ORDER,
  FIXED_SECTION_KEYS,
  HOME_SECTION_META,
  RECRUITER_SECTION_ORDER,
  isSameOrder,
  type SectionKey,
  type SortableSectionKey,
} from '../../../lib/homeShape'
import SortableList, { SortableHandle } from '../shell/SortableList'
import { MONO, outlineButtonProps } from '../shell/ui'
import { moveItem } from './homeForm'

const META = new Map(HOME_SECTION_META.map((m) => [m.key, m]))

type Props = {
  order: SortableSectionKey[]
  sections: Partial<Record<SectionKey, boolean>>
  onOrderChange: (order: SortableSectionKey[]) => void
  onToggle: (key: SectionKey, visible: boolean) => void
}

/** One row: visibility checkbox, label and hint (the sortable rows add a drag handle). */
function SectionRow({
  sectionKey,
  visible,
  onToggle,
  position,
  handle,
}: {
  sectionKey: SectionKey
  visible: boolean
  onToggle: (key: SectionKey, visible: boolean) => void
  /** "[02]" for numbered rows; the fixed rows have none. */
  position?: string
  handle?: ReactNode
}) {
  const meta = META.get(sectionKey)
  const label = meta?.label ?? sectionKey
  return (
    <Flex
      align="center"
      gap={2}
      px={2.5}
      py={2}
      border="1px solid"
      borderColor={visible ? 'page.border-strong' : 'page.border'}
      borderRadius="lg"
      bg={visible ? 'page.bg' : 'page.bg-elevated'}
      data-section-row={sectionKey}
    >
      {handle}
      <Checkbox
        isChecked={visible}
        onChange={(e) => onToggle(sectionKey, e.target.checked)}
        aria-label={`Show ${label} on the home page`}
        colorScheme="purple"
        mx={1}
      />
      {/* A hidden section reads quiet by colour (and its "hidden" badge), not by opacity — its words keep ≥ 4.5:1. */}
      <Box flex={1} minW={0}>
        <Text fontSize="sm" fontWeight={600} color={visible ? undefined : 'page.fg-secondary'}>
          {position ? (
            <Text as="span" fontFamily={MONO} fontSize="11px" color="page.fg-secondary" mr={2} className="tnum" aria-hidden>
              {position}
            </Text>
          ) : null}
          {label}
          {!visible ? (
            <Badge ml={2} variant="outline" fontFamily={MONO} fontSize="9px" textTransform="none" colorScheme="gray">
              hidden
            </Badge>
          ) : null}
        </Text>
        {meta?.hint ? (
          <Text fontSize="xs" color="page.fg-secondary" mt={0.5}>
            {meta.hint}
          </Text>
        ) : null}
      </Box>
    </Flex>
  )
}

/**
 * Home sections: which ones show, and the order of the numbered ones.
 *
 *   - The hero, the highlights strip and the brand strip always sit at the
 *     top in that order; they can only be switched on or off.
 *   - The numbered sections ([02]…) are a sortable list (drag the handle, or
 *     Space + arrow keys) with a checkbox each.
 *   - "Recruiter-first" puts projects, experience, papers, writing and skills before
 *     the GitHub activity in one click; "Default order" restores the
 *     built-in order. Neither touches visibility.
 *
 * Numbers on the live page count only the visible sections that have
 * content, so the [NN] shown here is the position if everything shows.
 */
export default function SectionsSection({ order, sections, onOrderChange, onToggle }: Props) {
  const visible = (key: SectionKey) => sections[key] !== false
  const recruiter = isSameOrder(order, RECRUITER_SECTION_ORDER)
  const standard = isSameOrder(order, DEFAULT_SECTION_ORDER)

  return (
    <Box>
      <Flex align="center" justify="space-between" gap={3} flexWrap="wrap" mb={3}>
        <Text fontSize="xs" color="page.fg-secondary" role="status" aria-live="polite">
          {recruiter ? 'Order: recruiter-first.' : standard ? 'Order: default.' : 'Order: custom.'}
        </Text>
        <ButtonGroup size="sm" spacing={2} flexWrap="wrap">
          <Button {...outlineButtonProps} onClick={() => onOrderChange([...RECRUITER_SECTION_ORDER])} isDisabled={recruiter}>
            Recruiter-first
          </Button>
          <Button variant="ghost" color="page.fg-secondary" onClick={() => onOrderChange([...DEFAULT_SECTION_ORDER])} isDisabled={standard}>
            Default order
          </Button>
        </ButtonGroup>
      </Flex>

      <Text fontFamily={MONO} fontSize="10px" letterSpacing="0.08em" textTransform="uppercase" color="page.fg-secondary" mb={2}>
        Always at the top
      </Text>
      <Flex direction="column" gap={2} as="ul" listStyleType="none" aria-label="Sections at the top of the home page">
        {FIXED_SECTION_KEYS.map((key) => (
          <li key={key}>
            <SectionRow sectionKey={key} visible={visible(key)} onToggle={onToggle} />
          </li>
        ))}
      </Flex>

      <Text fontFamily={MONO} fontSize="10px" letterSpacing="0.08em" textTransform="uppercase" color="page.fg-secondary" mt={5} mb={2}>
        Numbered sections, in order
      </Text>
      <SortableList
        items={order}
        getId={(k) => k}
        itemNoun="section"
        ariaLabel="Numbered home sections, in display order"
        spacing={2}
        onReorder={(from, to) => onOrderChange(moveItem(order, from, to))}
        renderItem={(key, { index }) => (
          <SectionRow
            sectionKey={key}
            visible={visible(key)}
            onToggle={onToggle}
            position={`[${String(index + 2).padStart(2, '0')}]`}
            handle={<SortableHandle label={`Reorder ${META.get(key)?.label ?? key}`} />}
          />
        )}
      />
    </Box>
  )
}
