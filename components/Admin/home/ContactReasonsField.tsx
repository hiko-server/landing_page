import { useId, useState } from 'react'
import { Box, Button, Flex, FormLabel, IconButton, Input, Select, Text } from '@chakra-ui/react'
import { AddIcon, CloseIcon } from '@chakra-ui/icons'
import {
  DEFAULT_REASONS,
  DEFAULT_REASON_INTENTS,
  INQUIRY_INTENTS,
  INQUIRY_LIMITS,
  INTENT_LABEL,
  intentFieldsSummary,
  type InquiryIntent,
} from '../../../lib/inquiry'
import { MONO, inputProps, outlineButtonProps } from '../shell/ui'
import type { ContactForm } from './homeForm'
import type { Updater } from './ImageCards'

/**
 * The contact form's reasons, each with the kind of inquiry it starts
 * (role / freelance / collaboration / other). The kind decides which
 * optional structured fields the public form discloses (lib/inquiry.ts) and
 * how the message is labelled in the Inbox. An empty list uses the built-in
 * reasons and their built-in kinds.
 */
export default function ContactReasonsField({ value, onChange }: { value: ContactForm; onChange: Updater<ContactForm> }) {
  const [draft, setDraft] = useState('')
  const [notice, setNotice] = useState('')
  const labelId = useId()
  const intents = value.intents || {}

  const add = () => {
    const v = draft.trim().slice(0, INQUIRY_LIMITS.reasonMax)
    if (!v) return
    if (value.reasons.includes(v)) {
      setNotice(`“${v}” is already in the list.`)
      return
    }
    onChange((c) => ({ ...c, reasons: [...c.reasons, v] }))
    setDraft('')
    setNotice('')
  }

  const setIntent = (reason: string, intent: InquiryIntent) =>
    onChange((c) => {
      const next = { ...(c.intents || {}) }
      if (intent === 'other') delete next[reason]
      else next[reason] = intent
      return { ...c, intents: next }
    })

  const remove = (idx: number) =>
    onChange((c) => {
      const reason = c.reasons[idx]
      const next = { ...(c.intents || {}) }
      if (reason && !c.reasons.some((r, i) => i !== idx && r === reason)) delete next[reason]
      return { ...c, reasons: c.reasons.filter((_, i) => i !== idx), intents: next }
    })

  const restoreDefaults = () =>
    onChange((c) => ({
      ...c,
      reasons: [...DEFAULT_REASONS],
      intents: Object.fromEntries(Object.entries(DEFAULT_REASON_INTENTS).filter(([, k]) => k !== 'other')) as Record<string, InquiryIntent>,
    }))

  return (
    <Box>
      <FormLabel id={labelId} mb={1}>
        Reasons (dropdown)
        <Text as="span" color="page.fg-secondary" fontWeight="normal" fontSize="xs" ml={2}>
          empty list = use defaults
        </Text>
      </FormLabel>
      <Text fontSize="xs" color="page.fg-secondary" mb={3} maxW="62ch">
        Each reason’s kind decides which optional fields the form adds: a role asks for the company, the job posting and an
        ideal start; a freelance project for the company, a brief and a timeline; a collaboration for the organisation and a
        link. The Inbox labels messages by kind.
      </Text>

      {value.reasons.length === 0 ? (
        <Box as="ul" listStyleType="none" m={0} mb={3} p={0} aria-labelledby={labelId}>
          <Text as="li" fontSize="xs" color="page.fg-secondary" fontStyle="italic" mb={1.5}>
            No custom reasons — the dropdown shows the built-in ones:
          </Text>
          {DEFAULT_REASONS.map((r) => {
            const kind = DEFAULT_REASON_INTENTS[r] ?? 'other'
            return (
              <Flex as="li" key={r} gap={3} fontSize="sm" py={0.5} wrap="wrap">
                <Text minW="140px" fontWeight={500}>
                  {r}
                </Text>
                <Text color="page.fg-secondary" fontFamily={MONO} fontSize="12px">
                  {INTENT_LABEL[kind]} · {intentFieldsSummary(kind)}
                </Text>
              </Flex>
            )
          })}
        </Box>
      ) : (
        <Box as="ul" listStyleType="none" m={0} mb={3} p={0} aria-labelledby={labelId}>
          {value.reasons.map((r, idx) => {
            const kind: InquiryIntent = intents[r] ?? 'other'
            const selectId = `${labelId}-kind-${idx}`
            return (
              <Flex
                as="li"
                key={`${r}-${idx}`}
                align="center"
                gap={2}
                py={1.5}
                borderTop={idx ? '1px solid' : undefined}
                borderColor="page.border"
                wrap="wrap"
              >
                <Text flex="1 1 160px" minW={0} fontSize="sm" fontWeight={500} noOfLines={1}>
                  {r}
                </Text>
                <Flex align="center" gap={2} flex="1 1 260px" minW={0}>
                  <FormLabel htmlFor={selectId} m={0} fontSize="xs" color="page.fg-secondary" flexShrink={0}>
                    Kind
                  </FormLabel>
                  <Select
                    id={selectId}
                    size="sm"
                    {...inputProps}
                    value={kind}
                    onChange={(e) => setIntent(r, e.target.value as InquiryIntent)}
                    maxW="200px"
                  >
                    {INQUIRY_INTENTS.map((k) => (
                      <option key={k} value={k}>
                        {INTENT_LABEL[k]}
                      </option>
                    ))}
                  </Select>
                  <Text fontFamily={MONO} fontSize="11px" color="page.fg-secondary" display={{ base: 'none', md: 'block' }} noOfLines={1}>
                    {intentFieldsSummary(kind)}
                  </Text>
                </Flex>
                <IconButton
                  aria-label={`Remove reason ${r}`}
                  icon={<CloseIcon boxSize="8px" />}
                  size="sm"
                  variant="ghost"
                  color="page.fg-secondary"
                  onClick={() => remove(idx)}
                />
              </Flex>
            )
          })}
        </Box>
      )}

      <Flex gap={2} flexWrap="wrap">
        <Input
          flex="1 1 200px"
          aria-label="New reason"
          placeholder="Add a reason (e.g. Speaking engagement)"
          value={draft}
          maxLength={INQUIRY_LIMITS.reasonMax}
          onChange={(e) => {
            setDraft(e.target.value)
            if (notice) setNotice('')
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
              e.preventDefault()
              add()
            }
          }}
        />
        <Button size="sm" {...outlineButtonProps} onClick={add} leftIcon={<AddIcon boxSize={2.5} />} flexShrink={0}>
          Add
        </Button>
        <Button size="sm" variant="ghost" color="page.fg-secondary" onClick={restoreDefaults} flexShrink={0}>
          Restore defaults
        </Button>
      </Flex>
      <Text role="status" aria-live="polite" fontSize="xs" color="page.fg-secondary" mt={1} minH="1.2em">
        {notice}
      </Text>
    </Box>
  )
}
