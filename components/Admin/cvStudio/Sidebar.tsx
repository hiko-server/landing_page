import React from 'react'
import { Badge, Box, Button, Flex, HStack, IconButton, Menu, MenuButton, MenuItem, MenuList, Portal, Text, Tooltip, VisuallyHidden } from '@chakra-ui/react'
import { AddIcon, ChevronDownIcon } from '@chakra-ui/icons'
import { FaGripVertical } from 'react-icons/fa'
import { FiFileText, FiGlobe } from 'react-icons/fi'
import { DndContext, KeyboardSensor, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core'
import { SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { countHidden, isSectionOnCv, isSectionOnWebsite } from '../../../lib/cvVisibility'
import { CV_SECTIONS, SECTION_BY_NAME, websiteWhere } from '../../../lib/cvSections'
import { monoFont, useStudioTokens } from './fields'
import { entryKey, type Section } from './docOps'

/** How a section lines up with the other language (for the alignment badge). */
export type SectionAlignment = { missing: boolean; lists: number }

function entryCount(section: Section): number {
  const def = SECTION_BY_NAME[section.sessionName]
  if (!def) return 0
  let n = 0
  for (const l of def.lists || []) n += Array.isArray(section[l.key]) ? section[l.key].length : 0
  for (const f of def.fields || []) if (f.kind === 'bullets' && Array.isArray(section[f.key])) n += section[f.key].length
  return n
}

function ScopeToggle({
  on,
  icon,
  label,
  onToggle,
}: {
  on: boolean
  icon: React.ReactElement
  label: string
  onToggle: () => void
}) {
  const { faint } = useStudioTokens()
  return (
    <Tooltip label={`${on ? 'Shown on' : 'Hidden from'} ${label} — click to ${on ? 'hide' : 'show'}`} hasArrow openDelay={300}>
      <IconButton
        aria-label={`${on ? 'Hide from' : 'Show on'} ${label}`}
        aria-pressed={on}
        icon={icon}
        size="xs"
        variant="ghost"
        color={on ? 'var(--accent)' : faint}
        opacity={on ? 1 : 0.55}
        position="relative"
        _after={
          on
            ? undefined
            : {
                content: '""',
                position: 'absolute',
                width: '16px',
                height: '1.5px',
                bg: 'currentColor',
                transform: 'rotate(-45deg)',
              }
        }
        _hover={{ bg: 'var(--accent-soft)', opacity: 1 }}
        onClick={(e) => {
          e.stopPropagation()
          onToggle()
        }}
      />
    </Tooltip>
  )
}

function SidebarRow({
  section,
  id,
  active,
  onSelect,
  onToggleCv,
  onToggleWeb,
  alignment,
  otherLabel,
}: {
  section: Section
  id: string
  active: boolean
  onSelect: () => void
  onToggleCv: () => void
  onToggleWeb: () => void
  alignment?: SectionAlignment
  otherLabel: string
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id })
  const { border, dim, faint, hiddenFg } = useStudioTokens()
  const def = SECTION_BY_NAME[section.sessionName]
  const offAlign = !!alignment && (alignment.missing || alignment.lists > 0)
  const alignText = alignment?.missing
    ? `Not in ${otherLabel} yet`
    : `${alignment?.lists || 0} list(s) differ in length from ${otherLabel}`
  const onCv = isSectionOnCv(section)
  const onWeb = isSectionOnWebsite(section)
  const hidden = countHidden(section)
  const n = entryCount(section)
  return (
    <Flex
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      align="center"
      gap={1.5}
      pl={1}
      pr={1}
      py={1.5}
      borderRadius="md"
      border="1px solid"
      borderColor={active ? 'var(--accent)' : 'transparent'}
      bg={active ? 'var(--accent-soft)' : 'transparent'}
      _hover={{ borderColor: active ? 'var(--accent)' : border }}
      cursor="pointer"
      onClick={onSelect}
      opacity={isDragging ? 0.6 : 1}
      zIndex={isDragging ? 2 : undefined}
      position="relative"
      transition="background-color 140ms var(--ease-out-quart), border-color 140ms var(--ease-out-quart)"
    >
      <Box
        {...attributes}
        {...listeners}
        aria-label={`Reorder ${def?.label || section.sessionName}`}
        cursor="grab"
        color={faint}
        p={1}
        _active={{ cursor: 'grabbing' }}
        _focusVisible={{ outline: '2px solid var(--accent)', borderRadius: 'sm' }}
        onClick={(e) => e.stopPropagation()}
      >
        <FaGripVertical size={10} />
      </Box>
      <Box
        as="button"
        type="button"
        display="block"
        textAlign="left"
        flex={1}
        minW={0}
        opacity={onCv || onWeb ? 1 : 0.55}
        aria-current={active ? 'true' : undefined}
        borderRadius="sm"
        _focusVisible={{ outline: '2px solid var(--accent)', outlineOffset: '2px' }}
        onClick={(e: React.MouseEvent) => {
          e.stopPropagation()
          onSelect()
        }}
      >
        <HStack as="span" spacing={1.5}>
          <Text as="span" fontSize="13px" fontWeight={active ? 600 : 500} noOfLines={1} minW={0}>
            {def?.label || section.sessionName}
          </Text>
          {hidden > 0 ? (
            <Tooltip label={`${hidden} hidden field(s), item(s) or entries`} hasArrow>
              <Badge colorScheme="orange" variant="subtle" fontFamily={monoFont} fontSize="9px" px={1} flexShrink={0}>
                {hidden}
                <VisuallyHidden> hidden</VisuallyHidden>
              </Badge>
            </Tooltip>
          ) : null}
          {offAlign ? (
            <Tooltip label={`${alignText} — linked edits there apply to one language`} hasArrow>
              <Text as="span" fontFamily={monoFont} fontSize="10px" color={hiddenFg} flexShrink={0}>
                <span aria-hidden>≠</span>
                <VisuallyHidden>{alignText}</VisuallyHidden>
              </Text>
            </Tooltip>
          ) : null}
        </HStack>
        <Text as="span" display="block" fontFamily={monoFont} fontSize="10px" color={dim} noOfLines={1}>
          {section.headerName || section.sessionName}
          {n ? ` · ${n}` : ''}
        </Text>
      </Box>
      <ScopeToggle on={onCv} icon={<FiFileText />} label="CV / PDF" onToggle={onToggleCv} />
      <ScopeToggle on={onWeb} icon={<FiGlobe />} label={`website (${websiteWhere(section.sessionName)})`} onToggle={onToggleWeb} />
    </Flex>
  )
}

export default function Sidebar({
  sections,
  selected,
  onSelect,
  onMove,
  onToggleCv,
  onToggleWeb,
  onAdd,
  alignment,
  otherLabel,
}: {
  sections: Section[]
  selected: string | null
  onSelect: (name: string) => void
  onMove: (from: number, to: number) => void
  onToggleCv: (idx: number) => void
  onToggleWeb: (idx: number) => void
  onAdd: (name: string) => void
  /** Per-section alignment with the other language, keyed by sessionName. */
  alignment: Record<string, SectionAlignment>
  otherLabel: string
}) {
  const { border, dim, faint } = useStudioTokens()
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )
  const ids = sections.map((s, i) => entryKey(s) ?? `${s.sessionName}::${i}`)
  const available = CV_SECTIONS.filter((d) => !sections.some((s) => s.sessionName === d.sessionName))
  const onDragEnd = (e: DragEndEvent) => {
    if (!e.over || e.active.id === e.over.id) return
    const from = ids.indexOf(String(e.active.id))
    const to = ids.indexOf(String(e.over.id))
    if (from >= 0 && to >= 0) onMove(from, to)
  }
  const onCvCount = sections.filter(isSectionOnCv).length
  const onWebCount = sections.filter(isSectionOnWebsite).length

  return (
    <Flex direction="column" h="100%" minH={0}>
      <Flex align="center" justify="space-between" px={3} pt={3} pb={2}>
        <Text fontFamily={monoFont} fontSize="10px" letterSpacing="0.12em" textTransform="uppercase" color={dim}>
          Sections
        </Text>
        <HStack spacing={2} fontFamily={monoFont} fontSize="10px" color={faint}>
          <HStack spacing={1}>
            <FiFileText />
            <Text>{onCvCount}</Text>
          </HStack>
          <HStack spacing={1}>
            <FiGlobe />
            <Text>{onWebCount}</Text>
          </HStack>
        </HStack>
      </Flex>
      <Box flex={1} minH={0} overflowY="auto" px={2} pb={2}>
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
          <SortableContext items={ids} strategy={verticalListSortingStrategy}>
            <Flex direction="column" gap={0.5}>
              {sections.map((s, i) => (
                <SidebarRow
                  key={ids[i]}
                  id={ids[i]}
                  section={s}
                  active={selected === s.sessionName}
                  onSelect={() => onSelect(s.sessionName)}
                  onToggleCv={() => onToggleCv(i)}
                  onToggleWeb={() => onToggleWeb(i)}
                  alignment={alignment[s.sessionName]}
                  otherLabel={otherLabel}
                />
              ))}
            </Flex>
          </SortableContext>
        </DndContext>
        {sections.length === 0 ? (
          <Text fontSize="12px" color={dim} px={2} py={4}>
            No sections yet — add one below.
          </Text>
        ) : null}
      </Box>
      <Box p={2} borderTop="1px solid" borderColor={border}>
        <Menu isLazy matchWidth>
          <MenuButton
            as={Button}
            size="sm"
            w="100%"
            variant="outline"
            borderColor={border}
            leftIcon={<AddIcon boxSize="9px" />}
            rightIcon={<ChevronDownIcon />}
            isDisabled={available.length === 0}
            fontSize="12px"
          >
            Add section
          </MenuButton>
          {/* Portaled: the sidebar's stacking context would otherwise put the lower items under the page footer. */}
          <Portal>
            <MenuList fontSize="13px" maxH="320px" overflowY="auto" zIndex="dropdown">
              {available.map((d) => (
                <MenuItem key={d.sessionName} onClick={() => onAdd(d.sessionName)}>
                  <Box>
                    <Text fontWeight={500}>{d.label}</Text>
                    <Text fontSize="11px" color={dim}>
                      {d.description}
                    </Text>
                  </Box>
                </MenuItem>
              ))}
            </MenuList>
          </Portal>
        </Menu>
        <Text mt={2} px={1} fontSize="10px" color={faint} lineHeight="1.5">
          <Box as="span" display="inline-flex" verticalAlign="-2px" mr={1}>
            <FiFileText />
          </Box>
          CV / PDF ·{' '}
          <Box as="span" display="inline-flex" verticalAlign="-2px" mx={1}>
            <FiGlobe />
          </Box>
          website ({websiteWhere(selected)})
        </Text>
      </Box>
    </Flex>
  )
}
