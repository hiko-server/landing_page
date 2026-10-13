import React, { useEffect, useId, useRef, useState } from 'react'
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
  Switch,
  Select,
  Text,
  Textarea,
  Tooltip,
  VisuallyHidden,
  usePrefersReducedMotion,
} from '@chakra-ui/react'
import { AddIcon, ChevronDownIcon, ChevronRightIcon, CopyIcon, DeleteIcon } from '@chakra-ui/icons'
import { FaEllipsisH, FaGripVertical } from 'react-icons/fa'
import { DndContext, KeyboardSensor, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core'
import { SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { countHidden, hiddenIndices, isFieldHidden, type CvPath } from '../../../lib/cvVisibility'
import { cvLabels } from '../../../lib/cvFormat'
import { defaultSpan, isFieldHideable, type FieldDef, type ListDef, type SectionDef } from '../../../lib/cvSections'
import { normalizeDoi } from '../../../lib/publications/doi'
import { PUB_DATE_RE, publicationHref } from '../../../lib/publications/normalize'
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
import { cvPathAttr, pathStartsWith, useStudio } from './StudioContext'
import PhotoField from './PhotoField'
import { entryKey, type ListOp } from './docOps'

const langName = (l: 'en' | 'zh') => (l === 'en' ? 'EN' : '中文')

// ── Single field ──────────────────────────────────────────────────────────

function FieldRenderer({ def, node, nodePath }: { def: FieldDef; node: any; nodePath: CvPath }) {
  const api = useStudio()
  const fieldId = useId()
  const { inputBg } = useStudioTokens()
  const hidden = isFieldHidden(node, def.key)
  const value = node?.[def.key]
  const path = [...nodePath, def.key]
  const cvPath = cvPathAttr(api.lang, path)
  const set = (v: any) => api.setValue(path, v, def.shared ? { shared: true } : undefined)
  const gridColumn = defaultSpan(def) === 2 ? '1 / -1' : undefined
  const str = typeof value === 'string' ? value : ''
  const missing = !!def.required && !str.trim() && def.kind !== 'bullets' && def.kind !== 'tags'
  const malformed = !!str.trim() && !wellFormed(def, str.trim())
  const invalid = missing || malformed
  const singular = def.label.replace(/s$/, '')

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
          presentId={`${fieldId}-present`}
        />
      )
      break
    case 'color':
      control = <ColorField value={str} onChange={set} />
      break
    case 'switch':
      control = (
        <HStack spacing={3} minH="32px">
          <Switch
            id={`${fieldId}-switch`}
            aria-labelledby={`${fieldId}-label`}
            aria-describedby={def.help ? `${fieldId}-helptext` : undefined}
            colorScheme="purple"
            isChecked={value === true}
            onChange={(e) => set(e.target.checked)}
          />
          <Text as="span" fontSize="12px" color={value === true ? undefined : 'page.fg-secondary'} aria-hidden>
            {value === true ? 'On' : 'Off'}
          </Text>
        </HStack>
      )
      break
    case 'image':
      control = <PhotoField value={str} onChange={set} twin={api.twinValue?.(path)} otherLabel={api.lang === 'en' ? '中文' : 'EN'} />
      break
    case 'select':
      control = (
        <Select {...inputProps} bg={inputBg} value={str} placeholder="Choose…" onChange={(e) => set(e.target.value)}>
          {(def.options || []).map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </Select>
      )
      break
    case 'yearMonth':
      control = (
        <Input
          {...inputProps}
          bg={inputBg}
          value={str}
          maxLength={7}
          autoComplete="off"
          placeholder={def.placeholder || 'YYYY or YYYY-MM'}
          onChange={(e) => set(e.target.value)}
        />
      )
      break
    case 'bullets': {
      const items: string[] = Array.isArray(value) ? value.map((x) => (typeof x === 'string' ? x : String(x ?? ''))) : []
      control = (
        <BulletList
          idBase={fieldId}
          itemLabel={singular}
          items={items}
          hiddenIndexes={hiddenIndices(node, def.key)}
          placeholder={def.placeholder}
          addLabel={`Add ${singular.toLowerCase()}`}
          cvPathPrefix={cvPath}
          onTextChange={(i, v) => api.setValue([...path, i], v)}
          onOp={(op) => api.list(path, op, op.type === 'remove' ? `Deleted ${singular.toLowerCase()}` : undefined)}
          onPasteLines={(i, lines) => api.insertMany(path, i, lines, !(items[i] || '').trim())}
          onToggleHidden={(i) => api.toggleItem(nodePath, def.key, i, (items[i] || '').trim() || `${singular} ${i + 1}`)}
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
          cvPathPrefix={cvPath}
          onOp={(op) => api.list(path, op)}
          onPasteTags={(vals) => api.insertMany(path, tags.length, vals)}
          onToggleHidden={(i) => api.toggleItem(nodePath, def.key, i, tags[i] || `${singular} ${i + 1}`)}
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
      fieldId={fieldId}
      label={def.label}
      required={def.required}
      hidden={hidden}
      hideable={isFieldHideable(def)}
      onToggleHidden={() => api.toggleField(nodePath, def.key, def.label)}
      help={malformed ? formatHint(def) : def.help}
      invalid={invalid}
      gridColumn={gridColumn}
      group={def.kind === 'bullets' || def.kind === 'image' || def.kind === 'switch'}
      cvPath={cvPath}
    >
      {control}
    </FieldShell>
  )
}

/** False when a filled value has the wrong shape for its kind / format (shown live; the save refuses it too). */
function wellFormed(def: FieldDef, value: string): boolean {
  if (def.kind === 'yearMonth') return PUB_DATE_RE.test(value)
  if (def.kind === 'select') return (def.options || []).some((o) => o.value === value)
  if (def.format === 'doi') return !!normalizeDoi(value)
  if (def.format === 'https-link') return !!publicationHref(value)
  return true
}

function formatHint(def: FieldDef): string {
  if (def.kind === 'yearMonth') return 'Use a year (2026) or a year and month (2026-03).'
  if (def.format === 'doi') return 'Not a DOI yet: it should look like 10.1234/abcd (a doi.org link works too).'
  if (def.format === 'https-link') return 'Use an https:// address or a path on this site such as /uploads/paper.pdf.'
  return def.help || ''
}

function FieldGrid({ fields, node, nodePath }: { fields: FieldDef[]; node: any; nodePath: CvPath }) {
  return (
    <Box display="grid" gridTemplateColumns={{ base: 'minmax(0, 1fr)', md: 'repeat(2, minmax(0, 1fr))' }} columnGap={3} rowGap={3}>
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
  const panelId = useId()
  const reduceMotion = usePrefersReducedMotion()
  const { border, borderStrong, dim, faint, surface, hiddenStripe } = useStudioTokens()
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id })
  const hidden = item?.isVisible === false
  const title = (def.titleOf(item) || '').trim()
  const subtitle = (def.subtitleOf?.(item) || '').trim()
  const name = title || `${def.itemNoun} ${index + 1}`
  // Everything hidden inside: fields, bullets and nested entries at any depth.
  const hiddenInside = countHidden(item)

  const actions = (
    <HStack spacing={0.5} flexShrink={0}>
      <VisibilityToggle hidden={hidden} onToggle={() => api.toggleEntry(path, name)} label={name} />
      <Menu isLazy placement="bottom-end">
        <MenuButton
          as={IconButton}
          aria-label={`More actions for ${name}`}
          icon={<FaEllipsisH size={11} />}
          size="xs"
          variant="ghost"
          color={faint}
          onClick={(e: React.MouseEvent) => e.stopPropagation()}
          onKeyDown={(e: React.KeyboardEvent) => e.stopPropagation()}
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
          <MenuItem icon={<DeleteIcon />} color="red.400" onClick={() => onOp({ type: 'remove', index }, `Deleted ${def.itemNoun}`)}>
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
      aria-label={`Reorder ${name}`}
      color={faint}
      cursor="grab"
      _active={{ cursor: 'grabbing' }}
      _focusVisible={{ outline: '2px solid var(--accent)', borderRadius: 'sm' }}
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
        data-cvpath={cvPathAttr(api.lang, path)}
      >
        <Flex gap={1} align="flex-start">
          <Box pt={1}>{handle}</Box>
          <Box flex={1} minW={0}>
            {hidden ? (
              <Box mb={1.5}>
                <HiddenChip label={`${def.itemNoun} hidden`} />
              </Box>
            ) : null}
            <Box opacity={hidden ? 0.55 : 1} _focusWithin={{ opacity: 1 }}>
              <FieldGrid fields={def.fields} node={item} nodePath={path} />
            </Box>
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
      boxShadow={isDragging ? 'lg' : undefined}
      transition="border-color 160ms var(--ease-out-quart)"
      _hover={{ borderColor: borderStrong }}
      data-cvpath={cvPathAttr(api.lang, path)}
    >
      <Flex align="center" gap={2} px={2} py={2} cursor="pointer" onClick={onToggleExpanded}>
        {handle}
        <Flex
          as="button"
          type="button"
          flex={1}
          minW={0}
          align="center"
          gap={2}
          textAlign="left"
          aria-expanded={expanded}
          aria-controls={panelId}
          onClick={(e) => {
            e.stopPropagation()
            onToggleExpanded()
          }}
          borderRadius="md"
          _focusVisible={{ outline: '2px solid var(--accent)', outlineOffset: '2px' }}
        >
          <Box as="span" color={faint} flexShrink={0}>
            {expanded ? <ChevronDownIcon /> : <ChevronRightIcon />}
          </Box>
          <Box as="span" display="block" flex={1} minW={0} opacity={hidden ? 0.6 : 1}>
            <HStack as="span" spacing={2} minW={0}>
              <Text as="span" fontSize="13px" fontWeight={600} noOfLines={1} textDecoration={hidden ? 'line-through' : undefined}>
                {title || (
                  <Text as="span" color={faint} fontStyle="italic">
                    Untitled {def.itemNoun}
                  </Text>
                )}
              </Text>
              {hidden ? <HiddenChip /> : null}
              {!hidden && hiddenInside > 0 ? (
                <Badge variant="subtle" colorScheme="orange" fontFamily={monoFont} fontSize="9px" flexShrink={0}>
                  {hiddenInside} hidden
                  <VisuallyHidden> inside</VisuallyHidden>
                </Badge>
              ) : null}
            </HStack>
            {subtitle ? (
              <Text as="span" display="block" fontSize="11px" color={dim} noOfLines={1} mt={0.5}>
                {subtitle}
              </Text>
            ) : null}
          </Box>
        </Flex>
        <Text fontFamily={monoFont} fontSize="10px" color={faint} flexShrink={0} display={{ base: 'none', sm: 'block' }}>
          {String(index + 1).padStart(2, '0')}
        </Text>
        {actions}
      </Flex>
      <Collapse
        in={expanded}
        animateOpacity
        unmountOnExit
        transition={reduceMotion ? { enter: { duration: 0 }, exit: { duration: 0 } } : undefined}
      >
        <Box id={panelId} px={{ base: 3, md: 4 }} pb={4} pt={2} borderTop="1px solid" borderColor={border}>
          <Box opacity={hidden ? 0.6 : 1} _focusWithin={{ opacity: 1 }}>
            <FieldGrid fields={def.fields} node={item} nodePath={path} />
          </Box>
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
  const { dim, faint, hiddenFg } = useStudioTokens()
  const items: any[] = Array.isArray(parent?.[def.key]) ? parent[def.key] : []
  const listPath = [...parentPath, def.key]
  const listHidden = isFieldHidden(parent, def.key)
  // Stable in-memory keys (see docOps ENTRY_KEY): expanded state and drag
  // ids follow the entry, not its position.
  const keys = items.map((it, i) => entryKey(it) ?? `${listPath.join('.')}#${i}`)
  const keySig = keys.join('|')
  const [expanded, setExpanded] = useState<Set<string>>(() => (items.length <= 2 ? new Set(keys) : new Set()))
  const pendingExpand = useRef<number | null>(null)
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  // Open an entry that was just added / duplicated once it has its key.
  useEffect(() => {
    const at = pendingExpand.current
    if (at === null) return
    pendingExpand.current = null
    const k = keySig.split('|')[at]
    if (k) setExpanded((prev) => new Set(prev).add(k))
  }, [keySig])

  // Jump-to from the Hidden items panel: open the entry on the target path.
  const focus = api.focus
  useEffect(() => {
    if (!focus || focus.lang !== api.lang) return
    if (!pathStartsWith(focus.path, listPath) || focus.path.length <= listPath.length) return
    const idx = focus.path[listPath.length]
    const k = typeof idx === 'number' ? keySig.split('|')[idx] : undefined
    if (k) setExpanded((prev) => (prev.has(k) ? prev : new Set(prev).add(k)))
    // listPath is derived from props on every render; the jump request is the trigger.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focus, api.lang])

  const runOp = (op: ListOp, label?: string) => {
    if (op.type === 'insert') pendingExpand.current = op.index
    if (op.type === 'duplicate' && expanded.has(keys[op.index])) pendingExpand.current = op.index + 1
    api.list(listPath, op, label)
  }

  const onDragEnd = (e: DragEndEvent) => {
    if (!e.over || e.active.id === e.over.id) return
    const from = keys.indexOf(String(e.active.id))
    const to = keys.indexOf(String(e.over.id))
    if (from >= 0 && to >= 0) runOp({ type: 'move', from, to })
  }

  const allOpen = items.length > 0 && keys.every((k) => expanded.has(k))
  const twinLen = api.linked ? api.twinLength(listPath) : null
  const misaligned = twinLen !== null && twinLen !== items.length
  const other = langName(api.lang === 'en' ? 'zh' : 'en')

  return (
    <Box>
      <Flex align="center" justify="space-between" mb={2} gap={2} data-cvpath={cvPathAttr(api.lang, listPath)}>
        <HStack spacing={2} minW={0} flexWrap="wrap">
          <Text
            fontFamily={monoFont}
            fontSize={depth ? '10px' : '11px'}
            letterSpacing="0.1em"
            textTransform="uppercase"
            color={listHidden ? hiddenFg : dim}
            textDecoration={listHidden ? 'line-through' : undefined}
          >
            {def.label}
          </Text>
          <Text fontFamily={monoFont} fontSize="10px" color={faint}>
            {items.length}
          </Text>
          {listHidden ? <HiddenChip /> : null}
          {misaligned ? (
            <Tooltip
              label={`${other} has ${twinLen} here, so linked add / delete / reorder in this list apply to ${langName(api.lang)} only.`}
              hasArrow
            >
              <Badge variant="outline" colorScheme="orange" fontFamily={monoFont} fontSize="9px" tabIndex={0}>
                {other} {twinLen}
              </Badge>
            </Tooltip>
          ) : null}
        </HStack>
        <HStack spacing={1} flexShrink={0}>
          {!def.compact && items.length > 1 ? (
            <Button
              size="xs"
              variant="ghost"
              fontFamily={monoFont}
              fontSize="10px"
              color={faint}
              onClick={() => setExpanded(allOpen ? new Set() : new Set(keys))}
            >
              {allOpen ? 'collapse all' : 'expand all'}
            </Button>
          ) : null}
          {def.hideable ? (
            <VisibilityToggle hidden={listHidden} onToggle={() => api.toggleField(parentPath, def.key, def.label)} label={def.label} />
          ) : null}
        </HStack>
      </Flex>

      <Box opacity={listHidden ? 0.5 : 1} _focusWithin={{ opacity: 1 }} transition="opacity 180ms var(--ease-out-quart)">
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
          <SortableContext items={keys} strategy={verticalListSortingStrategy}>
            <Flex direction="column" gap={def.compact ? 1.5 : 2}>
              {items.map((item, i) => (
                <EntryCard
                  key={keys[i]}
                  id={keys[i]}
                  def={def}
                  item={item}
                  index={i}
                  count={items.length}
                  path={[...listPath, i]}
                  onOp={runOp}
                  expanded={expanded.has(keys[i])}
                  onToggleExpanded={() =>
                    setExpanded((prev) => {
                      const next = new Set(prev)
                      if (next.has(keys[i])) next.delete(keys[i])
                      else next.add(keys[i])
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
  const headingId = useId()
  const { inputBg } = useStudioTokens()

  if (!def) return <UnknownSectionEditor section={section} sectionIdx={sectionIdx} />

  return (
    <Flex direction="column" gap={6}>
      <FieldShell fieldId={headingId} label="Section heading" hideable={false}>
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
  const textId = useId()
  const [text, setText] = useState(() => JSON.stringify(section, null, 2))
  const [error, setError] = useState('')
  const { inputBg } = useStudioTokens()
  return (
    <Box>
      <Text fontSize="13px" mb={2} id={`${textId}-desc`}>
        <Text as="span" fontFamily={monoFont} color="orange.400">
          {section.sessionName}
        </Text>{' '}
        has no visual editor — edit it as JSON. It is kept as-is and is not rendered on the CV.
      </Text>
      <Textarea
        id={textId}
        aria-describedby={`${textId}-desc`}
        aria-label={`${section.sessionName} section JSON`}
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
          <Text fontSize="12px" color="red.400" role="alert">
            {error}
          </Text>
        ) : null}
      </Flex>
    </Box>
  )
}
