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

export function useStudioTokens() {
  return {
    border: useColorModeValue('rgba(0,0,0,0.10)', 'rgba(255,255,255,0.10)'),
    borderStrong: useColorModeValue('rgba(0,0,0,0.18)', 'rgba(255,255,255,0.20)'),
    dim: useColorModeValue('gray.600', 'gray.400'),
    faint: useColorModeValue('gray.500', 'gray.500'),
    surface: useColorModeValue('white', 'rgba(255,255,255,0.03)'),
    surfaceAlt: useColorModeValue('gray.50', 'rgba(255,255,255,0.02)'),
    inputBg: useColorModeValue('white', 'rgba(255,255,255,0.04)'),
    hiddenStripe: useColorModeValue(
      'repeating-linear-gradient(135deg, rgba(251,146,60,0.06) 0 8px, transparent 8px 16px)',
      'repeating-linear-gradient(135deg, rgba(251,146,60,0.08) 0 8px, transparent 8px 16px)',
    ),
  }
}

// ── Visibility toggle ─────────────────────────────────────────────────────

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
  const { faint } = useStudioTokens()
  return (
    <Tooltip label={hidden ? `Show “${label}”` : `Hide “${label}” from CV & website`} hasArrow openDelay={350}>
      <IconButton
        aria-label={hidden ? `Show ${label}` : `Hide ${label}`}
        aria-pressed={hidden}
        icon={hidden ? <ViewOffIcon /> : <ViewIcon />}
        size={size}
        variant="ghost"
        color={hidden ? 'orange.400' : faint}
        _hover={{ color: hidden ? 'orange.300' : 'var(--accent)', bg: 'var(--accent-soft)' }}
        onClick={(e) => {
          e.stopPropagation()
          onToggle()
        }}
      />
    </Tooltip>
  )
}

export function HiddenChip() {
  return (
    <Text
      as="span"
      fontFamily={monoFont}
      fontSize="9px"
      letterSpacing="0.1em"
      textTransform="uppercase"
      color="orange.400"
      border="1px solid"
      borderColor="orange.300"
      borderRadius="3px"
      px="4px"
      lineHeight="14px"
    >
      hidden
    </Text>
  )
}

// ── Field shell ───────────────────────────────────────────────────────────

export function FieldShell({
  label,
  required,
  hidden = false,
  hideable = true,
  onToggleHidden,
  help,
  invalid,
  children,
  gridColumn,
}: {
  label: string
  required?: boolean
  hidden?: boolean
  hideable?: boolean
  onToggleHidden?: () => void
  help?: string
  invalid?: boolean
  children: React.ReactNode
  gridColumn?: string
}) {
  const { dim } = useStudioTokens()
  return (
    <FormControl isInvalid={invalid} gridColumn={gridColumn} minW={0}>
      <Flex align="center" justify="space-between" mb={1} minH="24px" gap={2}>
        <HStack spacing={2} minW={0}>
          <FormLabel
            m={0}
            fontFamily={monoFont}
            fontSize="10px"
            letterSpacing="0.08em"
            textTransform="uppercase"
            color={hidden ? 'orange.400' : dim}
            textDecoration={hidden ? 'line-through' : undefined}
            noOfLines={1}
            requiredIndicator={<></>}
          >
            {label}
            {required ? (
              <Text as="span" color="var(--accent)" ml="3px" aria-hidden>
                •
              </Text>
            ) : null}
          </FormLabel>
          {hidden ? <HiddenChip /> : null}
        </HStack>
        {hideable && onToggleHidden ? <VisibilityToggle hidden={hidden} onToggle={onToggleHidden} label={label} /> : null}
      </Flex>
      <Box
        opacity={hidden ? 0.5 : 1}
        transition="opacity 180ms var(--ease-out-quart)"
        _focusWithin={{ opacity: 1 }}
      >
        {children}
      </Box>
      {help ? (
        <FormHelperText mt={1} fontSize="11px">
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

/** Month picker that tolerates legacy values ("2026", "2024-09-01") and an optional "Present" switch. */
export function MonthField({
  value,
  onChange,
  allowPresent,
  presentLabel = 'Present',
  id,
}: {
  value: string
  onChange: (v: string) => void
  allowPresent?: boolean
  presentLabel?: string
  id?: string
}) {
  const present = allowPresent && isPresent(value)
  const v = typeof value === 'string' ? value : ''
  const useMonthInput = !present && (v === '' || ISO_MONTH.test(v))
  const { inputBg } = useStudioTokens()
  return (
    <HStack spacing={2} align="center">
      {present ? (
        <Input {...inputProps} id={id} value={presentLabel} isReadOnly bg={inputBg} flex={1} tabIndex={-1} />
      ) : useMonthInput ? (
        <Input
          {...inputProps}
          id={id}
          type="month"
          bg={inputBg}
          value={v.slice(0, 7)}
          onChange={(e) => onChange(e.target.value)}
          flex={1}
        />
      ) : (
        <Input
          {...inputProps}
          id={id}
          bg={inputBg}
          value={v}
          placeholder="YYYY-MM"
          onChange={(e) => onChange(e.target.value)}
          flex={1}
        />
      )}
      {allowPresent ? (
        <Checkbox
          size="sm"
          isChecked={!!present}
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

export function ColorField({ value, onChange, id }: { value: string; onChange: (v: string) => void; id?: string }) {
  const presets = ['#0059ff', '#111111', '#4f46e5', '#0f766e', '#b91c1c', '#9333ea']
  const { border } = useStudioTokens()
  return (
    <HStack spacing={2} wrap="wrap">
      <Input
        id={id}
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
          aria-pressed={(value || '').toLowerCase() === c}
          w="22px"
          h="22px"
          borderRadius="full"
          bg={c}
          border="2px solid"
          borderColor={(value || '').toLowerCase() === c ? 'var(--accent)' : border}
          boxShadow={(value || '').toLowerCase() === c ? '0 0 0 2px var(--accent-ring)' : undefined}
          onClick={() => onChange(c)}
          transition="transform 120ms"
          _hover={{ transform: 'scale(1.1)' }}
        />
      ))}
    </HStack>
  )
}

// ── Bullet list ───────────────────────────────────────────────────────────

function SortableBulletRow({
  id,
  index,
  value,
  hidden,
  placeholder,
  onChange,
  onKeyDown,
  onPaste,
  onRemove,
  onToggleHidden,
  inputRef,
}: {
  id: string
  index: number
  value: string
  hidden: boolean
  placeholder?: string
  onChange: (v: string) => void
  onKeyDown: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void
  onPaste: (e: React.ClipboardEvent<HTMLTextAreaElement>) => void
  onRemove: () => void
  onToggleHidden: () => void
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
    >
      <Box
        {...attributes}
        {...listeners}
        aria-label={`Reorder item ${index + 1}`}
        color={faint}
        cursor="grab"
        pt="9px"
        px="2px"
        _active={{ cursor: 'grabbing' }}
        opacity={0.5}
        _groupHover={{ opacity: 1 }}
      >
        <FaGripVertical size={10} />
      </Box>
      <Textarea
        ref={(el) => {
          taRef.current = el
          inputRef(el)
        }}
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
        aria-label={`Item ${index + 1}`}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={onKeyDown}
        onPaste={onPaste}
        flex={1}
        minH="32px"
        py="6px"
      />
      <VisibilityToggle hidden={hidden} onToggle={onToggleHidden} label={value ? value.slice(0, 40) : `item ${index + 1}`} size="sm" />
      <IconButton
        aria-label={`Remove item ${index + 1}`}
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
  items,
  hiddenIndexes,
  placeholder,
  addLabel = 'Add item',
  onTextChange,
  onOp,
  onPasteLines,
  onToggleHidden,
}: {
  items: string[]
  hiddenIndexes: number[]
  placeholder?: string
  addLabel?: string
  onTextChange: (index: number, value: string) => void
  onOp: (op: ListOp) => void
  onPasteLines: (index: number, lines: string[]) => void
  onToggleHidden: (index: number) => void
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

  const ids = items.map((_, i) => `b${i}`)
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
                index={i}
                value={text}
                hidden={hiddenIndexes.includes(i)}
                placeholder={placeholder}
                inputRef={(el) => (refs.current[i] = el)}
                onChange={(v) => onTextChange(i, v)}
                onToggleHidden={() => onToggleHidden(i)}
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
  onOp,
  onPasteTags,
  onToggleHidden,
  id,
}: {
  tags: string[]
  hiddenIndexes: number[]
  placeholder?: string
  onOp: (op: ListOp) => void
  onPasteTags: (tags: string[]) => void
  onToggleHidden: (index: number) => void
  id?: string
}) {
  const [draft, setDraft] = useState('')
  const { border, inputBg, faint } = useStudioTokens()
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
            borderColor={hidden ? 'orange.300' : border}
            bg={hidden ? 'transparent' : 'var(--accent-soft)'}
            fontFamily={monoFont}
            fontSize="11px"
          >
            <Tooltip label={hidden ? 'Hidden — click to show' : 'Click to hide'} hasArrow openDelay={400}>
              <Box
                as="button"
                type="button"
                px={2}
                py="2px"
                aria-pressed={hidden}
                aria-label={`${hidden ? 'Show' : 'Hide'} ${t}`}
                textDecoration={hidden ? 'line-through' : undefined}
                color={hidden ? 'orange.400' : undefined}
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
              _hover={{ color: 'red.400' }}
              onClick={() => onOp({ type: 'remove', index: i })}
            >
              <CloseIcon boxSize="6px" />
            </Box>
          </HStack>
        )
      })}
      <Input
        id={id}
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
