import React, { useEffect, useLayoutEffect, useRef, useState } from 'react'
import {
  Box,
  Checkbox,
  Flex,
  FormControl,
  FormHelperText,
  FormLabel,
  HStack,
  IconButton,
  Input,
  Text,
  Textarea,
  Tooltip,
  VisuallyHidden,
  useColorModeValue,
  type TextareaProps,
} from '@chakra-ui/react'
import { AddIcon, CloseIcon, ViewIcon, ViewOffIcon } from '@chakra-ui/icons'
import { FaGripVertical } from 'react-icons/fa'
import { DndContext, KeyboardSensor, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core'
import { SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { isPresent } from '../../../lib/cvFormat'
import type { ListOp } from './docOps'

export const monoFont = 'var(--font-geist-mono), ui-monospace, monospace'

const useIsoLayoutEffect = typeof window !== 'undefined' ? useLayoutEffect : useEffect

/**
 * Studio colours. Structural colours are the site's semantic tokens (they
 * flip with the colour mode on their own); "hidden" uses an orange that
 * keeps AA contrast in both modes.
 */
export function useStudioTokens() {
  return {
    border: 'page.border',
    borderStrong: 'page.border-strong',
    dim: 'page.fg-secondary',
    faint: 'gray.500',
    surface: 'page.bg',
    surfaceAlt: 'page.bg-elevated',
    inputBg: 'page.bg',
    hiddenFg: useColorModeValue('orange.600', 'orange.300'),
    hiddenBorder: useColorModeValue('orange.400', 'orange.400'),
    hiddenStripe: useColorModeValue(
      'repeating-linear-gradient(135deg, rgba(234,88,12,0.07) 0 8px, transparent 8px 16px)',
      'repeating-linear-gradient(135deg, rgba(251,146,60,0.09) 0 8px, transparent 8px 16px)',
    ),
  }
}

// ── Visibility toggle ─────────────────────────────────────────────────────

/**
 * The eye. A real <button> (Enter / Space work natively) with a stable
 * accessible name and aria-pressed = hidden, so a screen reader announces
 * "Hide GPA from CV and website, toggle button, pressed" when it is hidden.
 */
export function VisibilityToggle({
  hidden,
  onToggle,
  label,
  size = 'xs',
}: {
  hidden: boolean
  onToggle: () => void
  label: string
  size?: 'xs' | 'sm'
}) {
  const { faint, hiddenFg } = useStudioTokens()
  return (
    <Tooltip label={hidden ? 'Show' : 'Hide from CV & website'} hasArrow openDelay={300}>
      <IconButton
        aria-label={`Hide ${label} from CV and website`}
        aria-pressed={hidden}
        data-vis-toggle=""
        icon={hidden ? <ViewOffIcon /> : <ViewIcon />}
        size={size}
        variant="ghost"
        flexShrink={0}
        color={hidden ? hiddenFg : faint}
        bg={hidden ? 'rgba(251,146,60,0.12)' : undefined}
        _hover={{ color: hidden ? hiddenFg : 'var(--accent)', bg: hidden ? 'rgba(251,146,60,0.18)' : 'var(--accent-soft)' }}
        _focusVisible={{ boxShadow: '0 0 0 2px var(--accent-ring)' }}
        onClick={(e) => {
          e.stopPropagation()
          onToggle()
        }}
        onKeyDown={(e) => {
          // Keep Enter / Space on the eye from also toggling an enclosing row.
          if (e.key === 'Enter' || e.key === ' ') e.stopPropagation()
        }}
      />
    </Tooltip>
  )
}

export function HiddenChip({ label = 'hidden' }: { label?: string }) {
  const { hiddenFg, hiddenBorder } = useStudioTokens()
  return (
    <Text
      as="span"
      fontFamily={monoFont}
      fontSize="9px"
      letterSpacing="0.1em"
      textTransform="uppercase"
      color={hiddenFg}
      border="1px solid"
      borderColor={hiddenBorder}
      borderRadius="3px"
      px="4px"
      lineHeight="14px"
      flexShrink={0}
      whiteSpace="nowrap"
    >
      {label}
    </Text>
  )
}

// ── Field shell ───────────────────────────────────────────────────────────

/**
 * Label row (label · hidden pill · eye) + control + help.
 *
 * Single-input controls sit in a FormControl whose id is `fieldId`, so the
 * label targets the input. Multi-input controls (`group`, e.g. bullet
 * lists) get role="group" labelled by the visible label instead, and give
 * each of their inputs its own id derived from `fieldId` — ids stay unique.
 */
/** A help line that warns about the value: 4.5:1 in both themes (as shell/ui warnTextProps). */
const WARN_TEXT = { color: 'orange.700', _dark: { color: 'orange.300' } } as const

export function FieldShell({
  fieldId,
  label,
  required,
  hidden = false,
  hideable = true,
  onToggleHidden,
  help,
  helpTone,
  invalid,
  children,
  gridColumn,
  group = false,
  cvPath,
  audience,
}: {
  fieldId: string
  label: string
  required?: boolean
  hidden?: boolean
  hideable?: boolean
  onToggleHidden?: () => void
  help?: string
  /** 'warning': the help line is a warning about the value (shown in the warning colour). */
  helpTone?: 'warning'
  invalid?: boolean
  children: React.ReactNode
  gridColumn?: string
  group?: boolean
  /** data-cvpath for jump-to from the Hidden items panel. */
  cvPath?: string
  /** The field's "Shows on" control (AudienceMenu), beside the eye. */
  audience?: React.ReactNode
}) {
  const { dim, hiddenFg } = useStudioTokens()
  const labelStyle = {
    m: 0,
    fontFamily: monoFont,
    fontSize: '10px',
    letterSpacing: '0.08em',
    textTransform: 'uppercase' as const,
    color: hidden ? hiddenFg : dim,
    textDecoration: hidden ? 'line-through' : undefined,
    noOfLines: 1,
  }
  const labelContent = (
    <>
      {label}
      {required ? (
        <Text as="span" color="var(--accent)" ml="3px" aria-hidden>
          •
        </Text>
      ) : null}
      {hidden ? <VisuallyHidden> (hidden from CV and website)</VisuallyHidden> : null}
    </>
  )
  const labelId = `${fieldId}-label`
  const helpId = `${fieldId}-helptext`
  const header = (labelEl: React.ReactNode) => (
    <Flex align="center" justify="space-between" mb={1} minH="24px" gap={2}>
      <HStack spacing={2} minW={0}>
        {labelEl}
        {hidden ? <HiddenChip /> : null}
      </HStack>
      <HStack spacing={0.5} flexShrink={0}>
        {audience}
        {hideable && onToggleHidden ? <VisibilityToggle hidden={hidden} onToggle={onToggleHidden} label={label} /> : null}
      </HStack>
    </Flex>
  )
  const body = (
    <Box opacity={hidden ? 0.5 : 1} transition="opacity 180ms var(--ease-out-quart)" _focusWithin={{ opacity: 1 }}>
      {children}
    </Box>
  )

  if (group) {
    return (
      <Box
        role="group"
        aria-labelledby={labelId}
        aria-describedby={help ? helpId : undefined}
        gridColumn={gridColumn}
        minW={0}
        data-cvpath={cvPath}
      >
        {header(
          <Text id={labelId} {...labelStyle}>
            {labelContent}
          </Text>,
        )}
        {body}
        {help ? (
          <Text id={helpId} mt={1} fontSize="11px" {...(helpTone === 'warning' ? WARN_TEXT : { color: dim })}>
            {help}
          </Text>
        ) : null}
      </Box>
    )
  }

  return (
    <FormControl id={fieldId} isInvalid={invalid} isRequired={required} gridColumn={gridColumn} minW={0} data-cvpath={cvPath}>
      {header(
        <FormLabel {...labelStyle} requiredIndicator={<></>}>
          {labelContent}
        </FormLabel>,
      )}
      {body}
      {help ? (
        <FormHelperText mt={1} fontSize="11px" {...(helpTone === 'warning' ? WARN_TEXT : { color: dim })}>
          {help}
        </FormHelperText>
      ) : null}
    </FormControl>
  )
}

// ── Inputs ────────────────────────────────────────────────────────────────

export const inputProps = {
  size: 'sm' as const,
  borderRadius: 'md',
  fontSize: '13px',
  focusBorderColor: 'var(--accent)',
}

/** Textarea that grows with its content (no inner scrollbars). */
export function AutoTextarea({ value, minRows = 2, ...rest }: TextareaProps & { value: string; minRows?: number }) {
  const ref = useRef<HTMLTextAreaElement | null>(null)
  useIsoLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight + 2}px`
  }, [value])
  return (
    <Textarea
      ref={ref}
      value={value}
      rows={minRows}
      resize="none"
      overflow="hidden"
      lineHeight="1.55"
      {...inputProps}
      {...rest}
    />
  )
}

const ISO_MONTH = /^\d{4}-\d{2}(-\d{2})?$/

/**
 * Month picker that tolerates legacy values ("2026", "2024-09-01") and an
 * optional "Present" switch. The month input takes the enclosing
 * FormControl's id; the checkbox gets its own `presentId`.
 */
export function MonthField({
  value,
  onChange,
  allowPresent,
  presentLabel = 'Present',
  presentId,
}: {
  value: string
  onChange: (v: string) => void
  allowPresent?: boolean
  presentLabel?: string
  presentId?: string
}) {
  const present = allowPresent && isPresent(value)
  const v = typeof value === 'string' ? value : ''
  const useMonthInput = !present && (v === '' || ISO_MONTH.test(v))
  const { inputBg } = useStudioTokens()
  return (
    <HStack spacing={2} align="center">
      {present ? (
        <Input {...inputProps} value={presentLabel} isReadOnly bg={inputBg} flex={1} tabIndex={-1} />
      ) : useMonthInput ? (
        <Input {...inputProps} type="month" bg={inputBg} value={v.slice(0, 7)} onChange={(e) => onChange(e.target.value)} flex={1} />
      ) : (
        <Input {...inputProps} bg={inputBg} value={v} placeholder="YYYY-MM" onChange={(e) => onChange(e.target.value)} flex={1} />
      )}
      {allowPresent ? (
        <Checkbox
          id={presentId}
          size="sm"
          isChecked={!!present}
          isRequired={false}
          onChange={(e) => onChange(e.target.checked ? 'present' : '')}
          colorScheme="purple"
          flexShrink={0}
        >
          <Text fontSize="12px">{presentLabel}</Text>
        </Checkbox>
      ) : null}
    </HStack>
  )
}

export function ColorField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const presets = ['#0059ff', '#111111', '#4f46e5', '#0f766e', '#b91c1c', '#9333ea']
  const { border } = useStudioTokens()
  const current = (value || '').toLowerCase()
  return (
    <HStack spacing={2} wrap="wrap">
      <Input
        type="color"
        value={value || '#0059ff'}
        onChange={(e) => onChange(e.target.value)}
        w="44px"
        h="32px"
        p="2px"
        borderRadius="md"
        cursor="pointer"
      />
      {presets.map((c) => (
        <Box
          key={c}
          as="button"
          type="button"
          aria-label={`Use color ${c}`}
          aria-pressed={current === c}
          w="22px"
          h="22px"
          borderRadius="full"
          bg={c}
          border="2px solid"
          borderColor={current === c ? 'var(--accent)' : border}
          boxShadow={current === c ? '0 0 0 2px var(--accent-ring)' : undefined}
          onClick={() => onChange(c)}
          transition="transform 120ms var(--ease-out-quart)"
          _hover={{ transform: 'scale(1.1)' }}
          _focusVisible={{ outline: '2px solid var(--accent)', outlineOffset: '2px' }}
          sx={{ '@media (prefers-reduced-motion: reduce)': { transition: 'none', _hover: { transform: 'none' } } }}
        />
      ))}
    </HStack>
  )
}

// ── Bullet list ───────────────────────────────────────────────────────────

function SortableBulletRow({
  id,
  inputId,
  index,
  count,
  itemLabel,
  value,
  hidden,
  placeholder,
  cvPath,
  onChange,
  onKeyDown,
  onPaste,
  onRemove,
  onToggleHidden,
  audience,
  inputRef,
}: {
  id: string
  inputId: string
  index: number
  count: number
  itemLabel: string
  value: string
  hidden: boolean
  placeholder?: string
  cvPath?: string
  onChange: (v: string) => void
  onKeyDown: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void
  onPaste: (e: React.ClipboardEvent<HTMLTextAreaElement>) => void
  onRemove: () => void
  onToggleHidden: () => void
  /** The bullet's "Shows on" control (AudienceMenu), beside its eye. */
  audience?: React.ReactNode
  inputRef: (el: HTMLTextAreaElement | null) => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id })
  const { faint, inputBg, hiddenStripe } = useStudioTokens()
  const taRef = useRef<HTMLTextAreaElement | null>(null)
  useIsoLayoutEffect(() => {
    const el = taRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight + 2}px`
  }, [value])
  const name = `${itemLabel} ${index + 1} of ${count}`
  return (
    <Flex
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      align="flex-start"
      gap={1}
      opacity={isDragging ? 0.6 : 1}
      zIndex={isDragging ? 2 : undefined}
      position="relative"
      role="group"
      aria-label={name}
      data-cvpath={cvPath}
    >
      <Box
        {...attributes}
        {...listeners}
        aria-label={`Reorder ${name}`}
        color={faint}
        cursor="grab"
        pt="9px"
        px="2px"
        _active={{ cursor: 'grabbing' }}
        opacity={0.5}
        _groupHover={{ opacity: 1 }}
        _focusVisible={{ opacity: 1, outline: '2px solid var(--accent)', borderRadius: 'sm' }}
      >
        <FaGripVertical size={10} />
      </Box>
      <Textarea
        ref={(el) => {
          taRef.current = el
          inputRef(el)
        }}
        id={inputId}
        value={value}
        rows={1}
        resize="none"
        overflow="hidden"
        lineHeight="1.5"
        {...inputProps}
        bg={hidden ? undefined : inputBg}
        backgroundImage={hidden ? hiddenStripe : undefined}
        textDecoration={hidden ? 'line-through' : undefined}
        color={hidden ? faint : undefined}
        placeholder={placeholder}
        aria-label={hidden ? `${name} (hidden from CV and website)` : name}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={onKeyDown}
        onPaste={onPaste}
        flex={1}
        minH="32px"
        py="6px"
      />
      {audience ? (
        <Box pt="4px" flexShrink={0}>
          {audience}
        </Box>
      ) : null}
      <VisibilityToggle
        hidden={hidden}
        onToggle={onToggleHidden}
        label={value.trim() ? `“${value.trim().slice(0, 40)}”` : `${itemLabel.toLowerCase()} ${index + 1}`}
        size="sm"
      />
      <IconButton
        aria-label={`Remove ${name}`}
        icon={<CloseIcon boxSize="8px" />}
        size="sm"
        variant="ghost"
        color={faint}
        _hover={{ color: 'red.400' }}
        onClick={onRemove}
      />
    </Flex>
  )
}

/**
 * One-line-per-bullet editor.
 *   Enter            → new bullet below (Shift+Enter keeps a line break)
 *   Backspace (empty)→ remove bullet, focus previous
 *   Alt+↑ / Alt+↓    → move bullet
 *   Paste multi-line → one bullet per line
 */
export function BulletList({
  idBase,
  itemLabel,
  items,
  hiddenIndexes,
  placeholder,
  addLabel = 'Add item',
  cvPathPrefix,
  onTextChange,
  onOp,
  onPasteLines,
  onToggleHidden,
  renderAudience,
}: {
  /** Prefix for each bullet's unique input id. */
  idBase: string
  /** Name of one bullet for screen readers ("Sub-point"). */
  itemLabel: string
  items: string[]
  hiddenIndexes: number[]
  placeholder?: string
  addLabel?: string
  /** data-cvpath of the list; each row gets `<prefix>.<index>`. */
  cvPathPrefix?: string
  onTextChange: (index: number, value: string) => void
  onOp: (op: ListOp) => void
  onPasteLines: (index: number, lines: string[]) => void
  onToggleHidden: (index: number) => void
  /** Each bullet's "Shows on" control (an audience per bullet, E4). */
  renderAudience?: (index: number, text: string) => React.ReactNode
}) {
  const refs = useRef<Array<HTMLTextAreaElement | null>>([])
  const [focusIdx, setFocusIdx] = useState<number | null>(null)
  const { dim } = useStudioTokens()
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  useEffect(() => {
    if (focusIdx === null) return
    const el = refs.current[focusIdx]
    if (el) {
      el.focus()
      const end = el.value.length
      el.setSelectionRange(end, end)
    }
    setFocusIdx(null)
  }, [focusIdx, items.length])

  // Strings cannot carry an entry key; positions are the identity here and
  // hidden-bullet indices are remapped by the list operations themselves.
  const ids = items.map((_, i) => `${idBase}-b${i}`)
  const onDragEnd = (e: DragEndEvent) => {
    if (!e.over || e.active.id === e.over.id) return
    const from = ids.indexOf(String(e.active.id))
    const to = ids.indexOf(String(e.over.id))
    if (from >= 0 && to >= 0) onOp({ type: 'move', from, to })
  }

  return (
    <Box>
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
        <SortableContext items={ids} strategy={verticalListSortingStrategy}>
          <Flex direction="column" gap={1.5}>
            {items.map((text, i) => (
              <SortableBulletRow
                key={ids[i]}
                id={ids[i]}
                inputId={`${idBase}-item-${i}`}
                index={i}
                count={items.length}
                itemLabel={itemLabel}
                value={text}
                hidden={hiddenIndexes.includes(i)}
                placeholder={placeholder}
                cvPath={cvPathPrefix ? `${cvPathPrefix}.${i}` : undefined}
                inputRef={(el) => (refs.current[i] = el)}
                onChange={(v) => onTextChange(i, v)}
                onToggleHidden={() => onToggleHidden(i)}
                audience={renderAudience?.(i, text)}
                onRemove={() => {
                  onOp({ type: 'remove', index: i })
                  setFocusIdx(Math.max(0, i - 1))
                }}
                onPaste={(e) => {
                  const txt = e.clipboardData.getData('text')
                  if (!txt.includes('\n')) return
                  const lines = txt
                    .split(/\r?\n/)
                    .map((l) => l.replace(/^\s*(?:[-*•·–]|\d+[.)])\s+/, '').trim())
                    .filter(Boolean)
                  if (lines.length < 2) return
                  e.preventDefault()
                  onPasteLines(i, lines)
                  setFocusIdx(i + lines.length - 1)
                }}
                onKeyDown={(e) => {
                  const el = e.currentTarget
                  if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                    e.preventDefault()
                    onOp({ type: 'insert', index: i + 1, item: '' })
                    setFocusIdx(i + 1)
                  } else if (e.key === 'Backspace' && el.value === '' && items.length > 0) {
                    e.preventDefault()
                    onOp({ type: 'remove', index: i })
                    setFocusIdx(Math.max(0, i - 1))
                  } else if (e.altKey && e.key === 'ArrowUp' && i > 0) {
                    e.preventDefault()
                    onOp({ type: 'move', from: i, to: i - 1 })
                    setFocusIdx(i - 1)
                  } else if (e.altKey && e.key === 'ArrowDown' && i < items.length - 1) {
                    e.preventDefault()
                    onOp({ type: 'move', from: i, to: i + 1 })
                    setFocusIdx(i + 1)
                  }
                }}
              />
            ))}
          </Flex>
        </SortableContext>
      </DndContext>
      <Flex
        as="button"
        type="button"
        mt={items.length ? 1.5 : 0}
        align="center"
        gap={2}
        fontSize="12px"
        color={dim}
        px={2}
        py={1}
        borderRadius="md"
        _hover={{ color: 'var(--accent)', bg: 'var(--accent-soft)' }}
        _focusVisible={{ outline: '2px solid var(--accent)', outlineOffset: '1px' }}
        onClick={() => {
          onOp({ type: 'insert', index: items.length, item: '' })
          setFocusIdx(items.length)
        }}
      >
        <AddIcon boxSize="9px" />
        {addLabel}
      </Flex>
    </Box>
  )
}

// ── Tags ──────────────────────────────────────────────────────────────────

/** Chip input: Enter / comma adds, Backspace on empty removes the last chip, click a chip to hide it. */
export function TagInput({
  tags,
  hiddenIndexes,
  placeholder,
  cvPathPrefix,
  onOp,
  onPasteTags,
  onToggleHidden,
}: {
  tags: string[]
  hiddenIndexes: number[]
  placeholder?: string
  /** data-cvpath of the list; each chip gets `<prefix>.<index>`. */
  cvPathPrefix?: string
  onOp: (op: ListOp) => void
  onPasteTags: (tags: string[]) => void
  onToggleHidden: (index: number) => void
}) {
  const [draft, setDraft] = useState('')
  const { border, inputBg, faint, hiddenFg, hiddenBorder } = useStudioTokens()
  const commit = (raw: string) => {
    const parts = raw
      .split(/[,，\n]/)
      .map((s) => s.trim())
      .filter(Boolean)
      .filter((p) => !tags.some((t) => t.toLowerCase() === p.toLowerCase()))
    if (parts.length === 1) onOp({ type: 'insert', index: tags.length, item: parts[0] })
    else if (parts.length > 1) onPasteTags(parts)
    setDraft('')
  }
  return (
    <Flex
      wrap="wrap"
      gap={1.5}
      p={1.5}
      border="1px solid"
      borderColor={border}
      borderRadius="md"
      bg={inputBg}
      _focusWithin={{ borderColor: 'var(--accent)', boxShadow: '0 0 0 1px var(--accent)' }}
      minH="34px"
      align="center"
    >
      {tags.map((t, i) => {
        const hidden = hiddenIndexes.includes(i)
        return (
          <HStack
            key={`${t}-${i}`}
            spacing={0}
            borderRadius="4px"
            border="1px solid"
            borderColor={hidden ? hiddenBorder : border}
            borderStyle={hidden ? 'dashed' : 'solid'}
            bg={hidden ? 'transparent' : 'var(--accent-soft)'}
            fontFamily={monoFont}
            fontSize="11px"
            data-cvpath={cvPathPrefix ? `${cvPathPrefix}.${i}` : undefined}
          >
            <Tooltip label={hidden ? 'Show' : 'Hide from CV & website'} hasArrow openDelay={300}>
              <Box
                as="button"
                type="button"
                px={2}
                py="2px"
                data-vis-toggle=""
                aria-pressed={hidden}
                aria-label={`Hide ${t} from CV and website`}
                textDecoration={hidden ? 'line-through' : undefined}
                color={hidden ? hiddenFg : undefined}
                borderRadius="3px"
                _focusVisible={{ outline: '2px solid var(--accent)', outlineOffset: '1px' }}
                onClick={() => onToggleHidden(i)}
              >
                {t}
              </Box>
            </Tooltip>
            <Box
              as="button"
              type="button"
              aria-label={`Remove ${t}`}
              px={1.5}
              py="2px"
              color={faint}
              borderRadius="3px"
              _hover={{ color: 'red.400' }}
              _focusVisible={{ outline: '2px solid var(--accent)', outlineOffset: '1px' }}
              onClick={() => onOp({ type: 'remove', index: i })}
            >
              <CloseIcon boxSize="6px" />
            </Box>
          </HStack>
        )
      })}
      <Input
        variant="unstyled"
        size="sm"
        fontSize="13px"
        flex="1"
        minW="120px"
        px={1}
        value={draft}
        placeholder={tags.length ? '' : placeholder}
        onChange={(e) => {
          const v = e.target.value
          if (/[,，]/.test(v)) commit(v)
          else setDraft(v)
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
            e.preventDefault()
            commit(draft)
          } else if (e.key === 'Backspace' && draft === '' && tags.length) {
            e.preventDefault()
            onOp({ type: 'remove', index: tags.length - 1 })
          }
        }}
        onBlur={() => draft.trim() && commit(draft)}
        onPaste={(e) => {
          const txt = e.clipboardData.getData('text')
          if (/[,，\n]/.test(txt)) {
            e.preventDefault()
            commit(txt)
          }
        }}
      />
    </Flex>
  )
}
