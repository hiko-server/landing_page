import React, { useState } from 'react'
import {
  Badge,
  Box,
  Button,
  Collapse,
  Flex,
  HStack,
  IconButton,
  Input,
  Menu,
  MenuButton,
  MenuItem,
  MenuList,
  Text,
  Textarea,
  Tooltip,
} from '@chakra-ui/react'
import { AddIcon, ChevronDownIcon, ChevronRightIcon, CopyIcon, DeleteIcon } from '@chakra-ui/icons'
import { FaEllipsisH, FaGripVertical } from 'react-icons/fa'
import { DndContext, KeyboardSensor, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core'
import { SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { hiddenIndices, isFieldHidden, type CvPath } from '../../../lib/cvVisibility'
import { cvLabels } from '../../../lib/cvFormat'
import { defaultSpan, isFieldHideable, type FieldDef, type ListDef, type SectionDef } from '../../../lib/cvSections'
import {
  AutoTextarea,
  BulletList,
  ColorField,
  FieldShell,
  HiddenChip,
  MonthField,
  TagInput,
  VisibilityToggle,
  inputProps,
  monoFont,
  useStudioTokens,
} from './fields'
import { useStudio } from './StudioContext'
import { mappingFor, type ListOp } from './docOps'

// ── Single field ──────────────────────────────────────────────────────────

function FieldRenderer({ def, node, nodePath }: { def: FieldDef; node: any; nodePath: CvPath }) {
  const api = useStudio()
  const { inputBg } = useStudioTokens()
  const hidden = isFieldHidden(node, def.key)
  const value = node?.[def.key]
  const path = [...nodePath, def.key]
  const set = (v: any) => api.setValue(path, v)
  const gridColumn = defaultSpan(def) === 2 ? '1 / -1' : undefined
  const str = typeof value === 'string' ? value : ''
  const invalid = !!def.required && !str.trim() && def.kind !== 'bullets' && def.kind !== 'tags'

  let control: React.ReactNode
  switch (def.kind) {
    case 'textarea':
      control = <AutoTextarea value={str} bg={inputBg} placeholder={def.placeholder} onChange={(e) => set(e.target.value)} />
      break
    case 'month':
    case 'endMonth':
      control = (
        <MonthField
          value={str}
          onChange={set}
          allowPresent={def.kind === 'endMonth'}
          presentLabel={cvLabels(api.lang).present}
        />
      )
      break
    case 'color':
      control = <ColorField value={str} onChange={set} />
      break
    case 'bullets': {
      const items: string[] = Array.isArray(value) ? value.map((x) => (typeof x === 'string' ? x : String(x ?? ''))) : []
      control = (
        <BulletList
          items={items}
          hiddenIndexes={hiddenIndices(node, def.key)}
          placeholder={def.placeholder}
          addLabel={`Add ${def.label.toLowerCase().replace(/s$/, '')}`}
          onTextChange={(i, v) => api.setValue([...path, i], v)}
          onOp={(op) => api.list(path, op)}
          onPasteLines={(i, lines) => api.insertMany(path, i, lines, !(items[i] || '').trim())}
          onToggleHidden={(i) => api.toggleItem(nodePath, def.key, i)}
        />
      )
      break
    }
    case 'tags': {
      const tags: string[] = Array.isArray(value) ? value.filter((x) => typeof x === 'string') : []
      control = (
        <TagInput
          tags={tags}
          hiddenIndexes={hiddenIndices(node, def.key)}
          placeholder={def.placeholder}
          onOp={(op) => api.list(path, op)}
          onPasteTags={(vals) => api.insertMany(path, tags.length, vals)}
          onToggleHidden={(i) => api.toggleItem(nodePath, def.key, i)}
        />
      )
      break
    }
    default:
      control = (
        <Input
          {...inputProps}
          bg={inputBg}
          type={def.kind === 'email' ? 'email' : def.kind === 'tel' ? 'tel' : 'text'}
          inputMode={def.kind === 'url' ? 'url' : undefined}
          value={str}
          placeholder={def.placeholder}
          onChange={(e) => set(e.target.value)}
        />
      )
  }

  return (
    <FieldShell
      label={def.label}
      required={def.required}
      hidden={hidden}
      hideable={isFieldHideable(def)}
      onToggleHidden={() => api.toggleField(nodePath, def.key)}
      help={def.help}
      invalid={invalid}
      gridColumn={gridColumn}
    >
      {control}
    </FieldShell>
  )
}

function FieldGrid({ fields, node, nodePath }: { fields: FieldDef[]; node: any; nodePath: CvPath }) {
  return (
    <Box display="grid" gridTemplateColumns={{ base: '1fr', md: '1fr 1fr' }} columnGap={3} rowGap={3}>
      {fields.map((f) => (
        <FieldRenderer key={f.key} def={f} node={node} nodePath={nodePath} />
      ))}
    </Box>
  )
}

// ── Entry card ────────────────────────────────────────────────────────────

function EntryCard({
  id,
  def,
  item,
  index,
  count,
  path,
  onOp,
  expanded,
  onToggleExpanded,
  depth,
}: {
  id: string
  def: ListDef
  item: any
  index: number
  count: number
  path: CvPath
  onOp: (op: ListOp, label?: string) => void
  expanded: boolean
  onToggleExpanded: () => void
  depth: number
}) {
  const api = useStudio()
  const { border, borderStrong, dim, faint, surface, hiddenStripe } = useStudioTokens()
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id })
  const hidden = item?.isVisible === false
  const title = (def.titleOf(item) || '').trim()
  const subtitle = (def.subtitleOf?.(item) || '').trim()
  const hiddenInside =
    (Array.isArray(item?.hiddenFields) ? item.hiddenFields.length : 0) +
    Object.values(item?.hiddenItems || {}).reduce((n: number, l: any) => n + (Array.isArray(l) ? l.length : 0), 0)

  const actions = (
    <HStack spacing={0.5} flexShrink={0}>
      <VisibilityToggle hidden={hidden} onToggle={() => api.toggleEntry(path)} label={title || `${def.itemNoun} ${index + 1}`} />
      <Menu isLazy placement="bottom-end">
        <MenuButton
          as={IconButton}
          aria-label={`More actions for ${title || def.itemNoun}`}
          icon={<FaEllipsisH size={11} />}
          size="xs"
          variant="ghost"
          color={faint}
          onClick={(e: React.MouseEvent) => e.stopPropagation()}
        />
        <MenuList fontSize="13px" onClick={(e) => e.stopPropagation()}>
          <MenuItem icon={<CopyIcon />} onClick={() => onOp({ type: 'duplicate', index }, `Duplicated ${def.itemNoun}`)}>
            Duplicate
          </MenuItem>
          <MenuItem isDisabled={index === 0} onClick={() => onOp({ type: 'move', from: index, to: index - 1 })}>
            Move up
          </MenuItem>
          <MenuItem isDisabled={index === count - 1} onClick={() => onOp({ type: 'move', from: index, to: index + 1 })}>
            Move down
          </MenuItem>
          <MenuItem
            icon={<DeleteIcon />}
            color="red.400"
            onClick={() => onOp({ type: 'remove', index }, `Deleted ${def.itemNoun}`)}
          >
            Delete
          </MenuItem>
        </MenuList>
      </Menu>
    </HStack>
  )

  const handle = (
    <Box
      {...attributes}
      {...listeners}
      aria-label={`Reorder ${title || def.itemNoun}`}
      color={faint}
      cursor="grab"
      _active={{ cursor: 'grabbing' }}
      p={1}
      onClick={(e) => e.stopPropagation()}
    >
      <FaGripVertical size={10} />
    </Box>
  )

  const style = { transform: CSS.Transform.toString(transform), transition }

  if (def.compact) {
    return (
      <Box
        ref={setNodeRef}
        style={style}
        position="relative"
        zIndex={isDragging ? 3 : undefined}
        opacity={isDragging ? 0.7 : 1}
        border="1px solid"
        borderColor={border}
        borderRadius="md"
        bg={hidden ? undefined : surface}
        backgroundImage={hidden ? hiddenStripe : undefined}
        p={2}
      >
        <Flex gap={1} align="flex-start">
          <Box pt={1}>{handle}</Box>
          <Box flex={1} minW={0} opacity={hidden ? 0.55 : 1}>
            <FieldGrid fields={def.fields} node={item} nodePath={path} />
          </Box>
          {actions}
        </Flex>
      </Box>
    )
  }

  return (
    <Box
      ref={setNodeRef}
      style={style}
      position="relative"
      zIndex={isDragging ? 3 : undefined}
      border="1px solid"
      borderColor={expanded ? borderStrong : border}
      borderRadius="lg"
      bg={hidden ? undefined : surface}
      backgroundImage={hidden ? hiddenStripe : undefined}
      boxShadow={isDragging ? 'lg' : expanded ? 'sm' : undefined}
      transition="border-color 160ms, box-shadow 160ms"
      _hover={{ borderColor: borderStrong }}
    >
      <Flex
        align="center"
        gap={2}
        px={2}
        py={2}
        cursor="pointer"
        onClick={onToggleExpanded}
        role="button"
        tabIndex={0}
        aria-expanded={expanded}
        onKeyDown={(e) => {
          if ((e.key === 'Enter' || e.key === ' ') && e.target === e.currentTarget) {
            e.preventDefault()
            onToggleExpanded()
          }
        }}
        _focusVisible={{ outline: '2px solid var(--accent)', outlineOffset: '-2px', borderRadius: 'lg' }}
      >
        {handle}
        <Box color={faint} flexShrink={0}>
          {expanded ? <ChevronDownIcon /> : <ChevronRightIcon />}
        </Box>
        <Box flex={1} minW={0} opacity={hidden ? 0.6 : 1}>
          <HStack spacing={2} minW={0}>
            <Text fontSize="13px" fontWeight={600} noOfLines={1} textDecoration={hidden ? 'line-through' : undefined}>
              {title || <Text as="span" color={faint} fontStyle="italic">Untitled {def.itemNoun}</Text>}
            </Text>
            {hidden ? <HiddenChip /> : null}
            {!hidden && hiddenInside > 0 ? (
              <Tooltip label={`${hiddenInside} hidden field(s) / item(s) inside`} hasArrow>
                <Badge variant="subtle" colorScheme="orange" fontFamily={monoFont} fontSize="9px">
                  {hiddenInside} hidden
                </Badge>
              </Tooltip>
            ) : null}
          </HStack>
          {subtitle ? (
            <Text fontSize="11px" color={dim} noOfLines={1} mt={0.5}>
              {subtitle}
            </Text>
          ) : null}
        </Box>
        <Text fontFamily={monoFont} fontSize="10px" color={faint} flexShrink={0} display={{ base: 'none', sm: 'block' }}>
          {String(index + 1).padStart(2, '0')}
        </Text>
        {actions}
      </Flex>
      <Collapse in={expanded} animateOpacity unmountOnExit>
        <Box px={4} pb={4} pt={2} borderTop="1px solid" borderColor={border} opacity={hidden ? 0.6 : 1}>
          <FieldGrid fields={def.fields} node={item} nodePath={path} />
          {(def.lists || []).map((nested) => (
            <Box key={nested.key} mt={4}>
              <EntryList def={nested} parent={item} parentPath={path} depth={depth + 1} />
            </Box>
          ))}
        </Box>
      </Collapse>
    </Box>
  )
}

// ── Entry list ────────────────────────────────────────────────────────────

export function EntryList({ def, parent, parentPath, depth = 0 }: { def: ListDef; parent: any; parentPath: CvPath; depth?: number }) {
  const api = useStudio()
  const { dim, faint } = useStudioTokens()
  const items: any[] = Array.isArray(parent?.[def.key]) ? parent[def.key] : []
  const listPath = [...parentPath, def.key]
  const listHidden = isFieldHidden(parent, def.key)
  const [expanded, setExpanded] = useState<Set<number>>(() => (items.length <= 2 ? new Set(items.map((_, i) => i)) : new Set()))
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )
  const ids = items.map((_, i) => `${listPath.join('.')}#${i}`)

  /** Structural edit + keep the expanded/collapsed state attached to the same entries. */
  const runOp = (op: ListOp, label?: string) => {
    api.list(listPath, op, label)
    const map = mappingFor(op, items.length)
    setExpanded((prev) => {
      const next = new Set<number>()
      prev.forEach((i) => {
        const j = i < map.length ? map[i] : -1
        if (j >= 0) next.add(j)
      })
      if (op.type === 'insert') next.add(op.index)
      if (op.type === 'duplicate' && prev.has(op.index)) next.add(op.index + 1)
      return next
    })
  }

  const onDragEnd = (e: DragEndEvent) => {
    if (!e.over || e.active.id === e.over.id) return
    const from = ids.indexOf(String(e.active.id))
    const to = ids.indexOf(String(e.over.id))
    if (from >= 0 && to >= 0) runOp({ type: 'move', from, to })
  }

  const allOpen = items.length > 0 && expanded.size >= items.length

  return (
    <Box>
      <Flex align="center" justify="space-between" mb={2} gap={2}>
        <HStack spacing={2}>
          <Text
            fontFamily={monoFont}
            fontSize={depth ? '10px' : '11px'}
            letterSpacing="0.1em"
            textTransform="uppercase"
            color={listHidden ? 'orange.400' : dim}
            textDecoration={listHidden ? 'line-through' : undefined}
          >
            {def.label}
          </Text>
          <Text fontFamily={monoFont} fontSize="10px" color={faint}>
            {items.length}
          </Text>
          {listHidden ? <HiddenChip /> : null}
        </HStack>
        <HStack spacing={1}>
          {!def.compact && items.length > 1 ? (
            <Button
              size="xs"
              variant="ghost"
              fontFamily={monoFont}
              fontSize="10px"
              color={faint}
              onClick={() => setExpanded(allOpen ? new Set() : new Set(items.map((_, i) => i)))}
            >
              {allOpen ? 'collapse all' : 'expand all'}
            </Button>
          ) : null}
          {def.hideable ? (
            <VisibilityToggle hidden={listHidden} onToggle={() => api.toggleField(parentPath, def.key)} label={def.label} />
          ) : null}
        </HStack>
      </Flex>

      <Box opacity={listHidden ? 0.5 : 1} transition="opacity 180ms">
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
          <SortableContext items={ids} strategy={verticalListSortingStrategy}>
            <Flex direction="column" gap={def.compact ? 1.5 : 2}>
              {items.map((item, i) => (
                <EntryCard
                  key={ids[i]}
                  id={ids[i]}
                  def={def}
                  item={item}
                  index={i}
                  count={items.length}
                  path={[...listPath, i]}
                  onOp={runOp}
                  expanded={expanded.has(i)}
                  onToggleExpanded={() =>
                    setExpanded((prev) => {
                      const next = new Set(prev)
                      if (next.has(i)) next.delete(i)
                      else next.add(i)
                      return next
                    })
                  }
                  depth={depth}
                />
              ))}
            </Flex>
          </SortableContext>
        </DndContext>

        <Button
          mt={2}
          size="sm"
          w="100%"
          variant="outline"
          borderStyle="dashed"
          color={dim}
          fontWeight={500}
          fontSize="12px"
          leftIcon={<AddIcon boxSize="9px" />}
          _hover={{ color: 'var(--accent)', borderColor: 'var(--accent)', bg: 'var(--accent-soft)' }}
          onClick={() => runOp({ type: 'insert', index: items.length, item: def.blank() })}
        >
          Add {def.itemNoun}
        </Button>
      </Box>
    </Box>
  )
}

// ── Whole section ─────────────────────────────────────────────────────────

export function SectionEditor({ def, section, sectionIdx }: { def?: SectionDef; section: any; sectionIdx: number }) {
  const api = useStudio()
  const { inputBg } = useStudioTokens()

  if (!def) return <UnknownSectionEditor section={section} sectionIdx={sectionIdx} />

  return (
    <Flex direction="column" gap={6}>
      <FieldShell label="Section heading" hideable={false}>
        <Input
          {...inputProps}
          bg={inputBg}
          value={section.headerName || ''}
          onChange={(e) => api.setValue([sectionIdx, 'headerName'], e.target.value)}
          placeholder={def.headerDefault[api.lang]}
        />
      </FieldShell>
      {def.fields?.length ? <FieldGrid fields={def.fields} node={section} nodePath={[sectionIdx]} /> : null}
      {(def.lists || []).map((l) => (
        <EntryList key={l.key} def={l} parent={section} parentPath={[sectionIdx]} />
      ))}
    </Flex>
  )
}

function UnknownSectionEditor({ section, sectionIdx }: { section: any; sectionIdx: number }) {
  const api = useStudio()
  const [text, setText] = useState(() => JSON.stringify(section, null, 2))
  const [error, setError] = useState('')
  const { inputBg } = useStudioTokens()
  return (
    <Box>
      <Text fontSize="13px" mb={2}>
        <Text as="span" fontFamily={monoFont} color="orange.400">
          {section.sessionName}
        </Text>{' '}
        has no visual editor — edit it as JSON. It is kept as-is and is not rendered on the CV.
      </Text>
      <Textarea
        value={text}
        onChange={(e) => {
          setText(e.target.value)
          setError('')
        }}
        fontFamily={monoFont}
        fontSize="12px"
        minH="320px"
        bg={inputBg}
        spellCheck={false}
      />
      <Flex mt={2} gap={2} align="center">
        <Button
          size="sm"
          onClick={() => {
            try {
              const parsed = JSON.parse(text)
              if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('Must be a JSON object')
              if (parsed.sessionName !== section.sessionName) throw new Error('sessionName cannot change here')
              api.setValue([sectionIdx], parsed)
            } catch (e: any) {
              setError(e?.message || 'Invalid JSON')
            }
          }}
        >
          Apply JSON
        </Button>
        {error ? (
          <Text fontSize="12px" color="red.400">
            {error}
          </Text>
        ) : null}
      </Flex>
    </Box>
  )
}
