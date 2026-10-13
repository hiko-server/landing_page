import React, { createContext, useContext, useMemo, useState } from 'react'
import { Box, IconButton, SimpleGrid, Stack, type ResponsiveValue } from '@chakra-ui/react'
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  closestCenter,
  defaultDropAnimation,
  useSensor,
  useSensors,
  type Announcements,
  type DragEndEvent,
  type DragStartEvent,
  type DraggableAttributes,
  type DraggableSyntheticListeners,
  type UniqueIdentifier,
} from '@dnd-kit/core'
import {
  SortableContext,
  rectSortingStrategy,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { useReducedMotion } from 'framer-motion'
import { MdDragIndicator } from 'react-icons/md'

/**
 * Generic sortable list / grid for admin editors (@dnd-kit).
 *
 *   <SortableList items={photos} getId={(p) => p._id} itemNoun="photo"
 *     ariaLabel="Photos" layout="grid" onReorder={(from, to) => …}
 *     renderItem={(p, { index }) => <Card>…<SortableHandle label={`Reorder photo ${index + 1}`} /></Card>} />
 *
 *   - pointer (6 px before a drag starts, so clicks and text selection
 *     inside cards keep working), touch (150 ms press so the page still
 *     scrolls) and keyboard (Space / Enter on a handle, arrows, Space to
 *     drop, Esc to cancel)
 *   - screen-reader announcements: "Picked up photo 2 of 5", "… moved to
 *     position 3 of 5", "… dropped at position 3 of 5"
 *   - only the handle starts a drag; it is the element that carries the
 *     dnd-kit attributes and listeners
 *   - no drop animation and no reordering transitions under reduced motion
 */

type HandleCtx = {
  attributes: DraggableAttributes
  listeners: DraggableSyntheticListeners
  setActivatorNodeRef: (el: HTMLElement | null) => void
  isDragging: boolean
}

const HandleContext = createContext<HandleCtx | null>(null)

/** The drag handle of the enclosing sortable item. */
export function SortableHandle({ label }: { label: string }) {
  const ctx = useContext(HandleContext)
  if (!ctx) return null
  return (
    <IconButton
      ref={ctx.setActivatorNodeRef}
      {...ctx.attributes}
      {...ctx.listeners}
      aria-label={label}
      icon={<MdDragIndicator />}
      size="sm"
      variant="ghost"
      color="page.fg-secondary"
      cursor={ctx.isDragging ? 'grabbing' : 'grab'}
      sx={{ touchAction: 'none' }}
      _hover={{ color: 'page.fg', bg: 'page.bg-overlay' }}
      _active={{ transform: 'none' }}
      flexShrink={0}
    />
  )
}

function SortableItem({
  id,
  reduced,
  children,
}: {
  id: UniqueIdentifier
  reduced: boolean
  children: (isDragging: boolean) => React.ReactNode
}) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({
    id,
    transition: reduced ? null : undefined,
  })
  const ctx = useMemo(
    () => ({ attributes, listeners, setActivatorNodeRef, isDragging }),
    [attributes, listeners, setActivatorNodeRef, isDragging],
  )
  return (
    <Box
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition: reduced ? undefined : transition }}
      position="relative"
      zIndex={isDragging ? 2 : undefined}
      opacity={isDragging ? 0.45 : 1}
      minW={0}
    >
      <HandleContext.Provider value={ctx}>{children(isDragging)}</HandleContext.Provider>
    </Box>
  )
}

export type SortableRenderContext = { index: number; isDragging: boolean }

export default function SortableList<T>({
  items,
  getId,
  renderItem,
  renderOverlay,
  onReorder,
  ariaLabel,
  itemNoun = 'item',
  layout = 'list',
  columns = { base: 1, md: 2, xl: 3 },
  spacing = 3,
}: {
  items: T[]
  getId: (item: T) => string
  renderItem: (item: T, ctx: SortableRenderContext) => React.ReactNode
  /** Lightweight preview that follows the pointer while dragging (no form fields). */
  renderOverlay?: (item: T) => React.ReactNode
  onReorder: (from: number, to: number) => void
  ariaLabel: string
  /** Singular noun used in announcements ("photo" → "Picked up photo 2 of 5"). */
  itemNoun?: string
  layout?: 'list' | 'grid'
  columns?: ResponsiveValue<number>
  spacing?: number
}) {
  const reduced = !!useReducedMotion()
  const [activeId, setActiveId] = useState<UniqueIdentifier | null>(null)
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )
  const ids = useMemo(() => items.map(getId), [items, getId])
  const position = (id: UniqueIdentifier | undefined | null) => (id == null ? -1 : ids.indexOf(String(id)) + 1)
  const n = ids.length

  const announcements: Announcements = {
    onDragStart: ({ active }) => `Picked up ${itemNoun} ${position(active.id)} of ${n}.`,
    onDragOver: ({ active, over }) =>
      over ? `${cap(itemNoun)} ${position(active.id)} is over position ${position(over.id)} of ${n}.` : `${cap(itemNoun)} is no longer over a position.`,
    onDragEnd: ({ over }) =>
      over ? `${cap(itemNoun)} dropped at position ${position(over.id)} of ${n}.` : `${cap(itemNoun)} dropped.`,
    onDragCancel: ({ active }) => `Reordering cancelled. ${cap(itemNoun)} ${position(active.id)} is back in place.`,
  }

  const onDragStart = (e: DragStartEvent) => setActiveId(e.active.id)
  const onDragEnd = (e: DragEndEvent) => {
    setActiveId(null)
    const { active, over } = e
    if (!over || active.id === over.id) return
    const from = ids.indexOf(String(active.id))
    const to = ids.indexOf(String(over.id))
    if (from >= 0 && to >= 0) onReorder(from, to)
  }

  const activeItem = activeId == null ? null : items[ids.indexOf(String(activeId))]
  const Container = layout === 'grid' ? SimpleGrid : Stack

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onDragCancel={() => setActiveId(null)}
      accessibility={{
        announcements,
        screenReaderInstructions: {
          draggable: `To reorder, press Space or Enter on the handle, use the arrow keys to move the ${itemNoun}, then Space or Enter to drop it, or Escape to cancel.`,
        },
      }}
    >
      <SortableContext items={ids} strategy={layout === 'grid' ? rectSortingStrategy : verticalListSortingStrategy}>
        <Container
          role="list"
          aria-label={ariaLabel}
          {...(layout === 'grid' ? { columns, spacing } : { spacing })}
        >
          {items.map((item, index) => (
            <Box role="listitem" key={ids[index]} minW={0}>
              <SortableItem id={ids[index]} reduced={reduced}>
                {(isDragging) => renderItem(item, { index, isDragging })}
              </SortableItem>
            </Box>
          ))}
        </Container>
      </SortableContext>
      {renderOverlay ? (
        <DragOverlay dropAnimation={reduced ? null : defaultDropAnimation}>
          {activeItem !== null && activeItem !== undefined ? renderOverlay(activeItem) : null}
        </DragOverlay>
      ) : null}
    </DndContext>
  )
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)
