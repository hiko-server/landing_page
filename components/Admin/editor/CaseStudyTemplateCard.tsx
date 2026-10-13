import { Box, Button, Flex, ListItem, OrderedList, Text } from '@chakra-ui/react'
import { CASE_STUDY_SECTIONS, caseStudyTemplate } from './caseStudyTemplate'
import { MONO, outlineButtonProps } from '../shell/ui'

/**
 * The documented case-study template of the case-study editor (D1).
 *
 *   - Empty body: a card offering the outline (Problem → Role → Approach →
 *     Architecture → Outcomes → What I learned) with what goes in each part;
 *     "Use the template" fills the body with the headings and a guidance
 *     note under each — MDX comments, never shown on the page (the editor
 *     switches to the MDX tab for them).
 *   - Otherwise: the same guide, folded, next to the body.
 * The publish checklist warns about notes left behind and empty sections.
 */
export default function CaseStudyTemplateCard({ body, onInsert }: { body: string; onInsert: (template: string) => void }) {
  const empty = !body.trim()
  const guide = (
    <OrderedList spacing={2} m={0} pl={5} fontSize="13px" color="page.fg-secondary">
      {CASE_STUDY_SECTIONS.map((s) => (
        <ListItem key={s.heading}>
          <Text as="span" fontWeight={600} color="page.fg">
            {s.heading}
          </Text>{' '}
          — {s.guide}
        </ListItem>
      ))}
    </OrderedList>
  )

  if (!empty) {
    return (
      <Box as="details" border="1px solid" borderColor="page.border" borderRadius="md" px={4} py={2.5} bg="page.bg-elevated">
        <Box as="summary" cursor="pointer" fontSize="13px" fontWeight={500} color="page.fg" _focusVisible={{ outline: '2px solid var(--accent)', outlineOffset: '2px' }}>
          Case-study writing guide
        </Box>
        <Box mt={3} mb={1}>
          {guide}
        </Box>
      </Box>
    )
  }

  return (
    <Box as="section" aria-labelledby="cs-template-heading" border="1px dashed" borderColor="page.border-strong" borderRadius="lg" p={{ base: 4, md: 5 }} bg="page.bg-elevated">
      <Flex justify="space-between" align={{ base: 'flex-start', md: 'center' }} gap={4} direction={{ base: 'column', md: 'row' }} mb={4}>
        <Box>
          <Text as="h2" id="cs-template-heading" fontSize="15px" fontWeight={600} m={0}>
            Start from the case-study template
          </Text>
          <Text fontSize="13px" color="page.fg-secondary" mt={1} maxW="62ch">
            Six sections that answer what a reader looks for. Each comes with a note on what to write — notes are MDX comments and never appear on the page.
          </Text>
        </Box>
        <Button size="sm" {...outlineButtonProps} flexShrink={0} onClick={() => onInsert(caseStudyTemplate())}>
          Use the template
        </Button>
      </Flex>
      {guide}
      <Text mt={4} fontFamily={MONO} fontSize="11px" color="page.fg-secondary">
        Also in the body: type / and choose “Case-study outline”.
      </Text>
    </Box>
  )
}
