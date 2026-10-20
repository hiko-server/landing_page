import React, { useId, useState } from 'react'
import { Badge, Box, Button, Checkbox, Collapse, Flex, HStack, Text, Tooltip, usePrefersReducedMotion } from '@chakra-ui/react'
import { ChevronDownIcon, ChevronRightIcon } from '@chakra-ui/icons'
import SortableList, { SortableHandle } from '../shell/SortableList'
import { MONO } from '../shell/ui'
import type { CvVariant } from '../../../lib/cvVariants'
import {
  UNAVAILABLE_LABEL,
  moveEntry,
  moveSection,
  setListMode,
  toggleEntry,
  toggleSection,
  type EntryRow,
  type ListRow,
  type SectionRow,
} from './model'

/**
 * The sections and entries a variant prints (E4): the included sections in
 * the variant's order (drag the handle, or Space / arrows / Space on it),
 * each list either following the CV or naming its entries (chosen ones in
 * the variant's order, the rest below to add back); then the CV's other
 * sections to add. Anything the CV keeps away from private links is listed
 * with the reason and cannot be picked — Studio decides that.
 */

function Reason({ why }: { why: keyof typeof UNAVAILABLE_LABEL }) {
  return (
    <Text
      as="span"
      fontFamily={MONO}
      fontSize="9px"
      letterSpacing="0.08em"
      textTransform="uppercase"
      color="orange.700"
      _dark={{ color: 'orange.300' }}
      border="1px solid"
      borderColor="orange.400"
      borderRadius="3px"
      px="4px"
      lineHeight="14px"
      flexShrink={0}
      whiteSpace="nowrap"
    >
      {UNAVAILABLE_LABEL[why]}
    </Text>
  )
}

function EntryLine({
  entry,
  onToggle,
  handle,
}: {
  entry: EntryRow
  onToggle?: (on: boolean) => void
  handle?: React.ReactNode
}) {
  return (
    <Flex
      align="center"
      gap={2}
      px={2}
      py={1.5}
      borderRadius="md"
      border="1px solid"
      borderColor="page.border"
      bg={entry.chosen && !entry.unavailable ? 'page.bg' : 'transparent'}
      opacity={entry.unavailable ? 0.7 : 1}
      minW={0}
    >
      {handle}
      <Checkbox
        size="sm"
        colorScheme="purple"
        isChecked={entry.chosen && !entry.unavailable}
        isDisabled={!!entry.unavailable || !onToggle}
        onChange={(e) => onToggle?.(e.target.checked)}
        minW={0}
        flex={1}
        sx={{ '.chakra-checkbox__label': { minW: 0, flex: 1 } }}
      >
        <Box minW={0}>
          <Text fontSize="13px" fontWeight={500} noOfLines={1} textDecoration={entry.unavailable ? 'line-through' : undefined}>
            {entry.title}
          </Text>
          {entry.subtitle ? (
            <Text fontSize="11px" color="page.fg-secondary" noOfLines={1}>
              {entry.subtitle}
            </Text>
          ) : null}
        </Box>
      </Checkbox>
      {entry.unavailable ? <Reason why={entry.unavailable} /> : null}
    </Flex>
  )
}

function ListEditor({ section, list, variant, onChange }: { section: SectionRow; list: ListRow; variant: CvVariant; onChange: (v: CvVariant) => void }) {
  const groupId = useId()
  const chosen = list.entries.filter((e) => e.chosen && !e.unavailable)
  const rest = list.entries.filter((e) => !e.chosen || e.unavailable)
  const available = list.entries.filter((e) => !e.unavailable).length
  return (
    <Box mt={3}>
      <Flex align="center" justify="space-between" gap={2} flexWrap="wrap" mb={2}>
        <HStack spacing={2}>
          <Text id={groupId} fontFamily={MONO} fontSize="10px" letterSpacing="0.1em" textTransform="uppercase" color="page.fg-secondary">
            {list.label}
          </Text>
          <Text fontFamily={MONO} fontSize="10px" color="page.fg-subtle">
            {list.mode === 'chosen' ? `${chosen.length} of ${available}` : `all ${available}`}
          </Text>
          {list.unavailable ? <Reason why={list.unavailable} /> : null}
        </HStack>
        <Flex role="radiogroup" aria-labelledby={groupId} gap={0} border="1px solid" borderColor="page.border-strong" borderRadius="md" overflow="hidden">
          {(['all', 'chosen'] as const).map((m) => {
            const on = list.mode === m
            return (
              <Box
                as="button"
                type="button"
                key={m}
                role="radio"
                aria-checked={on}
                onClick={() => !on && onChange(setListMode(variant, section.name, list.key, m, list))}
                px={2.5}
                py={1}
                fontSize="11px"
                fontFamily={MONO}
                bg={on ? 'var(--accent-soft)' : 'transparent'}
                color={on ? 'accent.text' : 'page.fg-secondary'}
                _focusVisible={{ outline: '2px solid var(--accent)', outlineOffset: '-2px' }}
              >
                {m === 'all' ? 'All (follows the CV)' : 'Choose…'}
              </Box>
            )
          })}
        </Flex>
      </Flex>
      {list.mode === 'all' ? (
        <Text fontSize="12px" color="page.fg-secondary">
          Every {list.itemNoun} the CV shows on private links, in the CV’s order — new ones included.
        </Text>
      ) : (
        <Box>
          {chosen.length ? (
            <SortableList
              items={chosen}
              getId={(e) => e.uid}
              itemNoun={list.itemNoun}
              ariaLabel={`${list.label} in this variant, in order`}
              spacing={1.5}
              onReorder={(from, to) => onChange(moveEntry(variant, section.name, list.key, chosen[from].uid, chosen[to].uid, list))}
              renderItem={(e, { index }) => (
                <EntryLine
                  entry={e}
                  onToggle={(on) => onChange(toggleEntry(variant, section.name, list.key, e.uid, on, list))}
                  handle={<SortableHandle label={`Reorder ${e.title} (${index + 1} of ${chosen.length})`} />}
                />
              )}
            />
          ) : (
            <Text fontSize="12px" color="page.fg-secondary" py={1}>
              No {list.itemNoun} chosen — the list is left out.
            </Text>
          )}
          {rest.length ? (
            <Flex as="ul" direction="column" gap={1.5} listStyleType="none" m={0} mt={2} p={0} aria-label={`Other ${list.label.toLowerCase()}`}>
              {rest.map((e) => (
                <Box as="li" key={e.uid} pl={{ base: 0, md: 9 }}>
                  <EntryLine entry={e} onToggle={(on) => onChange(toggleEntry(variant, section.name, list.key, e.uid, on, list))} />
                </Box>
              ))}
            </Flex>
          ) : null}
        </Box>
      )}
    </Box>
  )
}

function SectionCard({
  row,
  variant,
  onChange,
  rowOrder,
  handle,
}: {
  row: SectionRow
  variant: CvVariant
  onChange: (v: CvVariant) => void
  rowOrder: string[]
  handle?: React.ReactNode
}) {
  const [open, setOpen] = useState(false)
  const reduce = usePrefersReducedMotion()
  const panelId = useId()
  const lists = row.lists
  const chosenLists = lists.filter((l) => l.mode === 'chosen').length
  return (
    <Box border="1px solid" borderColor={row.included ? 'page.border-strong' : 'page.border'} borderRadius="lg" bg={row.included ? 'page.bg' : 'transparent'}>
      <Flex align="center" gap={2} px={2} py={2} minW={0}>
        {handle}
        <Checkbox
          size="md"
          colorScheme="purple"
          isChecked={row.included}
          isDisabled={!!row.unavailable && !row.included}
          onChange={(e) => onChange(toggleSection(variant, row.name, e.target.checked, rowOrder))}
          flex={1}
          minW={0}
          sx={{ '.chakra-checkbox__label': { minW: 0, flex: 1 } }}
        >
          <Box minW={0}>
            <Text fontSize="14px" fontWeight={600} noOfLines={1}>
              {row.heading}
            </Text>
            {row.heading !== row.label ? (
              <Text fontSize="11px" color="page.fg-secondary" noOfLines={1}>
                {row.label}
              </Text>
            ) : null}
          </Box>
        </Checkbox>
        {row.unavailable ? (
          <Tooltip label={row.unavailable === 'off-cv' ? 'Switch the section on for the CV in Studio to use it' : 'Its audience leaves private links out (Studio → Shows on)'} hasArrow>
            <Box tabIndex={0} borderRadius="sm" _focusVisible={{ outline: '2px solid var(--accent)' }}>
              <Reason why={row.unavailable} />
            </Box>
          </Tooltip>
        ) : null}
        {row.included && !row.unavailable && lists.length ? (
          <Button
            size="xs"
            variant="ghost"
            fontFamily={MONO}
            fontSize="10px"
            color="page.fg-secondary"
            rightIcon={open ? <ChevronDownIcon /> : <ChevronRightIcon />}
            aria-expanded={open}
            aria-controls={panelId}
            onClick={() => setOpen((v) => !v)}
          >
            {chosenLists ? (
              <Badge variant="subtle" colorScheme="purple" fontSize="9px" mr={1}>
                chosen
              </Badge>
            ) : null}
            Entries
          </Button>
        ) : null}
      </Flex>
      {row.included && !row.unavailable && lists.length ? (
        <Collapse in={open} animateOpacity unmountOnExit transition={reduce ? { enter: { duration: 0 }, exit: { duration: 0 } } : undefined}>
          <Box id={panelId} px={{ base: 3, md: 4 }} pb={4} pt={1} borderTop="1px solid" borderColor="page.border">
            {lists.map((l) => (
              <ListEditor key={l.key} section={row} list={l} variant={variant} onChange={onChange} />
            ))}
          </Box>
        </Collapse>
      ) : null}
    </Box>
  )
}

export default function VariantSections({ rows, variant, onChange }: { rows: SectionRow[]; variant: CvVariant; onChange: (v: CvVariant) => void }) {
  const included = rows.filter((r) => r.included)
  const others = rows.filter((r) => !r.included)
  const order = rows.map((r) => r.name)
  return (
    <Box>
      <Flex align="baseline" justify="space-between" mb={2}>
        <Text as="h3" fontSize="13px" fontWeight={600}>
          In this variant
        </Text>
        <Text fontFamily={MONO} fontSize="10px" color="page.fg-secondary">
          {included.length} section{included.length === 1 ? '' : 's'}, in print order
        </Text>
      </Flex>
      {included.length ? (
        <SortableList
          items={included}
          getId={(r) => r.name}
          itemNoun="section"
          ariaLabel="Sections in this variant, in print order"
          spacing={2}
          onReorder={(from, to) => onChange(moveSection(variant, included[from].name, included[to].name))}
          renderItem={(r, { index }) => (
            <SectionCard row={r} variant={variant} onChange={onChange} rowOrder={order} handle={<SortableHandle label={`Reorder ${r.heading} (${index + 1} of ${included.length})`} />} />
          )}
        />
      ) : (
        <Box border="1px dashed" borderColor="page.border-strong" borderRadius="lg" px={4} py={6} textAlign="center">
          <Text fontSize="13px" fontWeight={500}>
            Nothing is in this variant yet
          </Text>
          <Text fontSize="12px" color="page.fg-secondary" mt={1}>
            Tick the sections below it should print.
          </Text>
        </Box>
      )}
      {others.length ? (
        <>
          <Text as="h3" fontSize="13px" fontWeight={600} mt={6} mb={2}>
            Not in this variant
          </Text>
          <Flex as="ul" direction="column" gap={2} listStyleType="none" m={0} p={0} aria-label="Sections not in this variant">
            {others.map((r) => (
              <Box as="li" key={r.name} pl={{ base: 0, md: 10 }}>
                <SectionCard row={r} variant={variant} onChange={onChange} rowOrder={order} />
              </Box>
            ))}
          </Flex>
        </>
      ) : null}
    </Box>
  )
}
