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

/** Chip list + "add" input for a list of roles. */
function RoleTags({
  label,
  roles,
  onChange,
  placeholder,
  lang,
}: {
  label: string
  roles: string[]
  onChange: (roles: string[]) => void
  placeholder: string
  lang?: string
}) {
  const [draft, setDraft] = useState('')
  const inputId = useId()
  const add = () => {
    const role = draft.trim()
    if (!role) return
    if (!roles.includes(role) && roles.length < HOME_LIMITS.rolesMax) onChange([...roles, role.slice(0, HOME_LIMITS.roleMax)])
    setDraft('')
  }
  return (
    <FormControl>
      <FormLabel htmlFor={inputId} mb={1} fontSize="xs" color="page.fg-secondary">
        {label}
      </FormLabel>
      {roles.length ? (
        <Wrap spacing={2} mb={2}>
          {roles.map((r) => (
            <WrapItem key={r}>
              <Tag size="md" borderRadius="full" variant="outline" color="page.fg" boxShadow="inset 0 0 0 1px var(--chakra-colors-page-border-strong)" lang={lang}>
                <TagLabel>{r}</TagLabel>
                <TagCloseButton aria-label={`Remove role ${r}`} onClick={() => onChange(roles.filter((x) => x !== r))} />
              </Tag>
            </WrapItem>
          ))}
        </Wrap>
      ) : null}
      <HStack>
        <Input
          id={inputId}
          size="sm"
          {...inputProps}
          value={draft}
          placeholder={placeholder}
          lang={lang}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
              e.preventDefault()
              add()
            }
          }}
        />
        <Button size="sm" {...outlineButtonProps} onClick={add} flexShrink={0}>
          Add
        </Button>
      </HStack>
    </FormControl>
  )
}

/** A titled group inside the section, separated by a hairline. */
function Group({ title, hint, children }: { title: string; hint: React.ReactNode; children: React.ReactNode }) {
  const id = useId()
  return (
    <Box as="section" aria-labelledby={id} mt={6} pt={4} borderTop="1px solid" borderColor="page.border">
      <Text id={id} fontSize="sm" fontWeight={600}>
        {title}
      </Text>
      <Text fontSize="xs" color="page.fg-secondary" mt={0.5} mb={3} maxW="66ch">
        {hint}
      </Text>
      {children}
    </Box>
  )
}

/**
 * Work availability (contact page card, command palette, CV header): status,
 * labels, roles, a start month, an https booking link, the owner's
 * right-to-work line (EN / 中文) and the job intent of the Chinese CV
 * (求职意向: roles in Chinese, city). "Clear" removes it from the site
 * entirely. Every edit stamps `updatedAt`.
 */
export default function AvailabilitySection({ value, onChange }: SectionProps<AvailabilityForm>) {
  const [now, setNow] = useState<number | null>(null)
  const groupId = useId()
  useEffect(() => setNow(Date.now()), [value.updatedAt])

  const edit = (change: Partial<AvailabilityForm>) =>
    onChange((prev) => ({ ...prev, ...change, updatedAt: Date.now() }))

  const bookingError = value.bookingUrl.trim() && !isHttpsUrl(value.bookingUrl.trim()) ? 'Use a full https:// link.' : undefined
  const disabled = !value.status
  const rolesZh = value.roles_zh || []
  const lengthError = (v: string | undefined, max: number) => ((v || '').trim().length > max ? `Keep it under ${max} characters.` : undefined)
  const isEmpty =
    !value.status &&
    !value.label &&
    !value.roles.length &&
    !value.bookingUrl &&
    !rolesZh.length &&
    !value.city_zh &&
    !value.workStatus &&
    !value.workStatus_zh

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
          <Button size="sm" variant="ghost" color="page.fg-secondary" onClick={() => onChange({ ...EMPTY_AVAILABILITY })} isDisabled={isEmpty}>
            Clear
          </Button>
        </Flex>
        <Text mt={2} fontSize="xs" color="page.fg-secondary" fontFamily={MONO}>
          {value.status
            ? `${STATUS_COPY[value.status].hint}${value.updatedAt && now ? ` · ${updatedAgo(value.updatedAt, now)}` : ''}`
            : 'Not shown anywhere on the site. Set a status to show availability, the right-to-work line and the job intent.'}
        </Text>
      </FormControl>

      <Box opacity={disabled ? 0.6 : 1}>
        <SimpleGrid columns={{ base: 1, md: 2 }} gap={3} mt={4}>
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

        <Box mt={4}>
          <RoleTags
            label="Roles"
            roles={value.roles}
            onChange={(roles) => edit({ roles })}
            placeholder="Add a role, press Enter (e.g. Frontend engineer)"
          />
        </Box>

        <Group
          title="Work authorisation"
          hint={
            <>
              Your right-to-work status in your own words — nothing is inferred. When filled it appears on the contact page’s
              availability card, next to the hiring fields of the form and in the CV header (English on /cv, 中文 on /cv/zh). It is
              never added to structured data (JSON-LD) or the vCard.
            </>
          }
        >
          <SimpleGrid columns={{ base: 1, md: 2 }} gap={3}>
            <TextField
              label="Work authorisation (English)"
              value={value.workStatus || ''}
              onChange={(v) => edit({ workStatus: v })}
              placeholder="Your status, as a recruiter should read it"
              invalid={lengthError(value.workStatus, HOME_LIMITS.workStatusMax)}
            />
            <TextField
              label="工作身份（中文）"
              value={value.workStatus_zh || ''}
              onChange={(v) => edit({ workStatus_zh: v })}
              placeholder="用你自己的话填写"
              invalid={lengthError(value.workStatus_zh, HOME_LIMITS.workStatusMax)}
            />
          </SimpleGrid>
        </Group>

        <Group
          title="Job intent on the Chinese CV · 求职意向"
          hint={
            <>
              A line at the top of /cv/zh with the roles and city below and “Available from” as 到岗时间. It shows only while
              the status is Open or Limited and at least one of them is filled; the English CV is unchanged.
            </>
          }
        >
          <SimpleGrid columns={{ base: 1, md: 2 }} gap={3} alignItems="start">
            <RoleTags
              label="岗位（中文）"
              roles={rolesZh}
              onChange={(roles) => edit({ roles_zh: roles })}
              placeholder="输入岗位后按回车"
              lang="zh-Hans"
            />
            <TextField
              label="城市（中文）"
              value={value.city_zh || ''}
              onChange={(v) => edit({ city_zh: v })}
              placeholder="期望工作城市"
              invalid={lengthError(value.city_zh, HOME_LIMITS.cityMax)}
            />
          </SimpleGrid>
        </Group>
      </Box>
    </Box>
  )
}
