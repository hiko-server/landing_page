import { Box, Button, Flex, IconButton, SimpleGrid, Text } from '@chakra-ui/react'
import { AddIcon, DeleteIcon } from '@chakra-ui/icons'
import SortableList, { SortableHandle } from '../shell/SortableList'
import { outlineButtonProps } from '../shell/ui'
import { moveItem, newId, type QuickItem } from './homeForm'
import { TextField, linkError, useUndoableRemove, type SectionProps } from './ImageCards'

/** Shortcut links as a sortable list (drag handle, keyboard, Undo on remove). */
export default function QuickAccessSection({ value, onChange }: SectionProps<QuickItem[]>) {
  const remove = useUndoableRemove(onChange, 'link')
  const patch = (id: string, change: Partial<QuickItem>) =>
    onChange((prev) => prev.map((q) => (q._id === id ? { ...q, ...change } : q)))

  return (
    <Box>
      {value.length === 0 ? (
        <Text fontSize="sm" color="page.fg-secondary" mb={3}>
          No quick links yet.
        </Text>
      ) : (
        <SortableList
          items={value}
          getId={(q) => q._id}
          itemNoun="link"
          ariaLabel="Quick links, in display order"
          spacing={2}
          onReorder={(from, to) => onChange((prev) => moveItem(prev, from, to))}
          renderItem={(q, { index }) => (
            <Flex align="flex-end" gap={2} p={2.5} border="1px solid" borderColor="page.border" borderRadius="lg" bg="page.bg">
              <Box pb={0.5}>
                <SortableHandle label={`Reorder link ${index + 1}`} />
              </Box>
              <SimpleGrid columns={{ base: 1, sm: 2 }} gap={2} flex={1} minW={0}>
                <TextField label="Label" value={q.label} onChange={(v) => patch(q._id, { label: v })} placeholder="Bus Search App" />
                <TextField label="URL" value={q.url} onChange={(v) => patch(q._id, { url: v })} placeholder="https://…" invalid={linkError(q.url)} />
              </SimpleGrid>
              <IconButton
                aria-label={`Remove link ${index + 1}`}
                size="sm"
                variant="ghost"
                color="page.fg-secondary"
                _hover={{ color: 'red.500', bg: 'page.bg-overlay' }}
                icon={<DeleteIcon />}
                onClick={() => remove(value, index)}
                mb={0.5}
              />
            </Flex>
          )}
        />
      )}
      <Button
        size="sm"
        mt={3}
        {...outlineButtonProps}
        leftIcon={<AddIcon boxSize={2.5} />}
        onClick={() => onChange((prev) => [...prev, { _id: newId(), label: '', url: '' }])}
      >
        Add quick link
      </Button>
    </Box>
  )
}
