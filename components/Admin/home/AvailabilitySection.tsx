import { useEffect, useId, useState } from 'react'
import {
  Box,
  Button,
  Flex,
  FormControl,
  FormLabel,
  HStack,
  Input,
  SimpleGrid,
  Tag,
  TagCloseButton,
  TagLabel,
  Text,
  Wrap,
  WrapItem,
} from '@chakra-ui/react'
import { AVAILABILITY_STATUSES, HOME_LIMITS, isHttpsUrl, type AvailabilityStatus } from '../../../lib/homeShape'
import { MONO, inputProps, outlineButtonProps } from '../shell/ui'
import { EMPTY_AVAILABILITY, updatedAgo, type AvailabilityForm } from './homeForm'
import { TextField, type SectionProps } from './ImageCards'

const STATUS_COPY: Record<AvailabilityStatus, { label: string; hint: string; token: string }> = {
  open: { label: 'Open', hint: 'Looking for roles or projects', token: 'status.open' },
  limited: { label: 'Limited', hint: 'Selective, or later', token: 'status.limited' },
  closed: { label: 'Closed', hint: 'Not taking anything on', token: 'status.closed' },
}

/**
 * Work availability (contact page card, command palette): status, labels,
 * roles, a start month and an https booking link. "Clear" removes it from
 * the site entirely. Every edit stamps `updatedAt`.
 */
export default function AvailabilitySection({ value, onChange }: SectionProps<AvailabilityForm>) {
  const [roleDraft, setRoleDraft] = useState('')
  const [now, setNow] = useState<number | null>(null)
  const groupId = useId()
  useEffect(() => setNow(Date.now()), [value.updatedAt])

  const edit = (change: Partial<AvailabilityForm>) =>
    onChange((prev) => ({ ...prev, ...change, updatedAt: Date.now() }))

  const addRole = () => {
    const role = roleDraft.trim()
    if (!role) return
    if (!value.roles.includes(role) && value.roles.length < HOME_LIMITS.rolesMax) edit({ roles: [...value.roles, role.slice(0, HOME_LIMITS.roleMax)] })
    setRoleDraft('')
  }

  const bookingError = value.bookingUrl.trim() && !isHttpsUrl(value.bookingUrl.trim()) ? 'Use a full https:// link.' : undefined
  const disabled = !value.status

  return (
    <Box>
      <FormControl as="fieldset">
        <FormLabel as="legend" id={groupId} fontSize="xs" color="page.fg-secondary" mb={2}>
          Status
        </FormLabel>
        <Flex gap={2} flexWrap="wrap" role="radiogroup" aria-labelledby={groupId}>
          {AVAILABILITY_STATUSES.map((s) => {
            const on = value.status === s
            return (
              <Button
                key={s}
                role="radio"
                aria-checked={on}
                size="sm"
                variant="outline"
                borderColor={on ? 'accent.500' : 'page.border-strong'}
                bg={on ? 'var(--accent-soft)' : 'transparent'}
                color="page.fg"
                _hover={{ bg: on ? 'var(--accent-soft)' : 'page.bg-overlay' }}
                onClick={() => edit({ status: s })}
                leftIcon={<Box w="8px" h="8px" borderRadius="full" bg={STATUS_COPY[s].token} aria-hidden />}
                title={STATUS_COPY[s].hint}
              >
                {STATUS_COPY[s].label}
              </Button>
            )
          })}
          <Button
            size="sm"
            variant="ghost"
            color="page.fg-secondary"
            onClick={() => onChange({ ...EMPTY_AVAILABILITY })}
            isDisabled={!value.status && !value.label && !value.roles.length && !value.bookingUrl}
          >
            Clear
          </Button>
        </Flex>
        <Text mt={2} fontSize="xs" color="page.fg-secondary" fontFamily={MONO}>
          {value.status
            ? `${STATUS_COPY[value.status].hint}${value.updatedAt && now ? ` · ${updatedAgo(value.updatedAt, now)}` : ''}`
            : 'Not shown anywhere on the site.'}
        </Text>
      </FormControl>

      <SimpleGrid columns={{ base: 1, md: 2 }} gap={3} mt={4} opacity={disabled ? 0.6 : 1}>
        <TextField label="Label (English)" value={value.label} onChange={(v) => edit({ label: v })} placeholder="Open to senior frontend roles" />
        <TextField label="Label (中文)" value={value.label_zh} onChange={(v) => edit({ label_zh: v })} placeholder="开放高级前端职位" />
        <FormControl>
          <FormLabel mb={1} fontSize="xs" color="page.fg-secondary">
            Available from
          </FormLabel>
          <Input size="sm" type="month" {...inputProps} value={value.from} onChange={(e) => edit({ from: e.target.value })} />
        </FormControl>
        <TextField
          label="Booking link"
          value={value.bookingUrl}
          onChange={(v) => edit({ bookingUrl: v })}
          placeholder="https://cal.com/…"
          invalid={bookingError}
          help="Shown as “Book a call”. https:// only."
        />
      </SimpleGrid>

      <FormControl mt={4}>
        <FormLabel mb={1} fontSize="xs" color="page.fg-secondary">
          Roles
        </FormLabel>
        <Wrap spacing={2} mb={2}>
          {value.roles.map((r) => (
            <WrapItem key={r}>
              <Tag size="md" borderRadius="full" variant="outline" color="page.fg" boxShadow="inset 0 0 0 1px var(--chakra-colors-page-border-strong)">
                <TagLabel>{r}</TagLabel>
                <TagCloseButton aria-label={`Remove role ${r}`} onClick={() => edit({ roles: value.roles.filter((x) => x !== r) })} />
              </Tag>
            </WrapItem>
          ))}
        </Wrap>
        <HStack>
          <Input
            size="sm"
            {...inputProps}
            value={roleDraft}
            placeholder="Add a role, press Enter (e.g. Frontend engineer)"
            aria-label="New role"
            onChange={(e) => setRoleDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
                e.preventDefault()
                addRole()
              }
            }}
          />
          <Button size="sm" {...outlineButtonProps} onClick={addRole} flexShrink={0}>
            Add
          </Button>
        </HStack>
      </FormControl>
    </Box>
  )
}
