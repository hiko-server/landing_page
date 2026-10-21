import { useEffect, useState } from 'react'
import { Box, Flex, Text, VisuallyHidden } from '@chakra-ui/react'
import type { PasswordStrength } from '../../../lib/adminAuth/passwordPolicy'
import { checklistAnnouncement, type PasswordRule as Rule } from './passwordRules'

/**
 * The new-password checklist and strength hint, shared by Admin → Security
 * → Password and the e-mail reset page (pages/admin/reset.tsx): the rules
 * the server applies (lib/adminAuth/passwordPolicy via passwordRules), each
 * with a shape as well as a colour, a rough strength meter, and ONE polite
 * status that reads the checklist — what is met, what is missing — once
 * typing pauses (never on every key). The field it describes lists `id`
 * and `${id}-strength` in its aria-describedby.
 */

const STRENGTH: Record<
  Exclude<PasswordStrength, 'none'>,
  { label: string; bars: number; color: string }
> = {
  'too-weak': { label: 'too weak', bars: 1, color: 'status.error' },
  fair: { label: 'fair', bars: 2, color: 'status.warning' },
  good: { label: 'good', bars: 3, color: 'accent.text' },
  strong: { label: 'strong', bars: 4, color: 'status.open' },
}

const RULE_COLOR: Record<Rule['state'], string> = {
  met: 'status.open',
  unmet: 'status.error',
  pending: 'page.fg-secondary',
}
const RULE_SR: Record<Rule['state'], string> = {
  met: 'done',
  unmet: 'not yet',
  pending: 'not checked yet',
}

function RuleIcon({ state }: { state: Rule['state'] }) {
  // Shape differs per state (tick, cross, ring), so colour is never the only cue.
  const common = {
    width: 14,
    height: 14,
    viewBox: '0 0 16 16',
    'aria-hidden': true,
    focusable: false,
  } as const
  if (state === 'met')
    return (
      <svg {...common}>
        <path
          d="M3 8.5l3.2 3L13 4.5"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    )
  if (state === 'unmet')
    return (
      <svg {...common}>
        <path
          d="M4.5 4.5l7 7M11.5 4.5l-7 7"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
        />
      </svg>
    )
  return (
    <svg {...common}>
      <circle cx="8" cy="8" r="5" fill="none" stroke="currentColor" strokeWidth="1.6" />
    </svg>
  )
}

export default function PasswordChecklist({
  id,
  value,
  rules,
  strength,
  note = 'Any characters work, spaces and emoji included. The strength is a rough estimate.',
}: {
  /** The list's id; the strength line is `${id}-strength`. */
  id: string
  /** The password the rules describe (nothing is announced while it is empty). */
  value: string
  rules: Rule[]
  strength: PasswordStrength
  note?: string
}) {
  const shown = strength === 'none' ? null : STRENGTH[strength]
  const [announcement, setAnnouncement] = useState('')
  const spoken = checklistAnnouncement(rules, shown ? shown.label : null)

  // Read the checklist out once typing pauses (not on every key).
  useEffect(() => {
    if (!value) {
      setAnnouncement('')
      return
    }
    const t = window.setTimeout(() => setAnnouncement(spoken), 1200)
    return () => window.clearTimeout(t)
  }, [value, spoken])

  return (
    <>
      <Text id={`${id}-title`} fontSize="12px" fontWeight={500} mb={1.5}>
        Requirements
      </Text>
      <Box
        as="ul"
        id={id}
        aria-labelledby={`${id}-title`}
        listStyleType="none"
        display="grid"
        rowGap={1}
      >
        {rules.map((r) => (
          <Flex as="li" key={r.key} align="center" gap={2} fontSize="13px" data-state={r.state}>
            <Box as="span" color={RULE_COLOR[r.state]} display="inline-flex" flexShrink={0}>
              <RuleIcon state={r.state} />
            </Box>
            <Text as="span" color={r.state === 'pending' ? 'page.fg-secondary' : 'page.fg'}>
              {r.label}
              <VisuallyHidden>{` — ${RULE_SR[r.state]}`}</VisuallyHidden>
            </Text>
          </Flex>
        ))}
      </Box>
      <Flex
        id={`${id}-strength`}
        align="center"
        gap={3}
        mt={3}
        fontSize="12px"
        color="page.fg-secondary"
      >
        <Flex gap={1} aria-hidden="true">
          {[1, 2, 3, 4].map((n) => (
            <Box
              key={n}
              w="28px"
              h="6px"
              borderRadius="full"
              bg={shown && n <= shown.bars ? shown.color : 'page.border-strong'}
            />
          ))}
        </Flex>
        <Text as="span">
          Strength:{' '}
          <Box as="span" fontWeight={600} color={shown ? shown.color : undefined}>
            {shown ? shown.label : '—'}
          </Box>
        </Text>
      </Flex>
      <Text fontSize="12px" color="page.fg-secondary" mt={2} maxW="46ch">
        {note}
      </Text>
      <VisuallyHidden role="status" aria-live="polite">
        {announcement}
      </VisuallyHidden>
    </>
  )
}
