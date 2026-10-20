import { useCallback, useEffect, useId, useState } from 'react'
import { Box, Button, Code, Flex, FormControl, FormHelperText, FormLabel, Skeleton, Switch, Text, useToast } from '@chakra-ui/react'
import { Panel, outlineButtonProps, warnTextProps } from '../shell/ui'
import { readJsonObject } from '../shell/http'
import { formatBucket } from '../../../lib/analytics/format'
import type { DigestStatus } from '../../../lib/analytics/digest'

/**
 * Admin → Analytics → Weekly digest (H10, /api/admin/analytics/digest): a
 * switch for the Monday e-mail with last week's numbers, where it goes
 * (masked), when it goes next in the owner's own time zone, what happened
 * last time, and "Send a preview now". Without SMTP the card explains the
 * setup instead of offering a switch that could not work.
 */

const errText = (e: unknown) => (e instanceof Error ? (e.message === 'Failed to fetch' ? 'Network error' : e.message) : String(e))

function isStatus(v: Record<string, unknown>): v is DigestStatus & Record<string, unknown> {
  return typeof v.smtp === 'boolean' && typeof v.enabled === 'boolean' && typeof v.hourUtc === 'number'
}

/** "Mondays at 09:00" in the browser's time zone (the schedule is UTC). */
function localSchedule(weekday: number, hourUtc: number): string {
  // Any Monday will do: 2024-01-01 was one.
  const at = new Date(Date.UTC(2024, 0, weekday, hourUtc))
  const day = at.toLocaleDateString('en', { weekday: 'long' })
  const time = at.toLocaleTimeString('en', { hour: '2-digit', minute: '2-digit' })
  const utcDay = new Date(Date.UTC(2024, 0, weekday)).toLocaleDateString('en', { weekday: 'long', timeZone: 'UTC' })
  return `${day}s at ${time} your time (${utcDay} ${String(hourUtc).padStart(2, '0')}:00 UTC)`
}

export default function DigestCard() {
  const toast = useToast()
  const headingId = useId()
  const switchId = useId()
  const [status, setStatus] = useState<DigestStatus | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState<'toggle' | 'send' | null>(null)

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/analytics/digest', { cache: 'no-store' })
      const json = await readJsonObject(res)
      if (!res.ok || !isStatus(json)) throw new Error(typeof json.error === 'string' ? json.error : `HTTP ${res.status}`)
      setStatus(json)
      setErr(null)
    } catch (e) {
      setErr(errText(e))
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const toggle = async (enabled: boolean) => {
    setBusy('toggle')
    try {
      const res = await fetch('/api/admin/analytics/digest', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ enabled }) })
      const json = await readJsonObject(res)
      if (!res.ok || !isStatus(json)) throw new Error(typeof json.error === 'string' ? json.error : `HTTP ${res.status}`)
      setStatus(json)
      toast({ status: 'success', title: enabled ? 'Weekly digest on' : 'Weekly digest off', position: 'bottom-right' })
    } catch (e) {
      toast({ status: 'error', title: 'Could not change the digest', description: errText(e), position: 'bottom-right' })
    } finally {
      setBusy(null)
    }
  }

  const sendPreview = async () => {
    setBusy('send')
    try {
      const res = await fetch('/api/admin/analytics/digest', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'send' }) })
      const json = await readJsonObject(res)
      if (json.status && typeof json.status === 'object' && isStatus(json.status as Record<string, unknown>)) setStatus(json.status as DigestStatus)
      if (res.ok && json.ok) toast({ status: 'success', title: 'Preview sent', description: `Last week’s digest is on its way to ${status?.recipient ?? 'you'}.`, position: 'bottom-right' })
      else if (json.skipped === 'smtp') toast({ status: 'warning', title: 'SMTP is not configured', description: 'Nothing was sent.', position: 'bottom-right' })
      else if (json.skipped === 'recipient') toast({ status: 'warning', title: 'No recipient', description: 'Set NOTIFY_EMAIL or ADMIN_EMAIL.', position: 'bottom-right' })
      else throw new Error(typeof json.error === 'string' ? json.error : `HTTP ${res.status}`)
    } catch (e) {
      toast({ status: 'error', title: 'The preview could not be sent', description: errText(e), position: 'bottom-right' })
    } finally {
      setBusy(null)
    }
  }

  const ready = !!status && status.smtp && !!status.recipient
  return (
    <Panel as="section" aria-labelledby={headingId} mt={4} data-digest="">
      <Text as="h3" id={headingId} fontSize="sm" fontWeight={600}>
        Weekly digest
      </Text>
      <Text fontSize="xs" color="page.fg-secondary" mt={0.5} maxW="68ch">
        An e-mail every Monday with last week&rsquo;s visitors and views (and the change), top pages, referrers and countries, goals, the CV conversion,
        posts published and Web Vitals. Totals only — never a search text or anything that identifies a visitor.
      </Text>

      {!status && !err ? <Skeleton h="56px" mt={4} borderRadius="md" /> : null}
      {err ? (
        <Text fontSize="sm" mt={4} {...warnTextProps} role="alert">
          The digest settings could not be loaded: {err}
        </Text>
      ) : null}

      {status && !status.smtp ? (
        <Box mt={4} p={3} borderRadius="md" border="1px dashed" borderColor="page.border-strong" fontSize="sm" data-testid="digest-setup">
          <Text fontWeight={600} mb={1}>
            Needs an SMTP account
          </Text>
          <Text color="page.fg-secondary" fontSize="xs" lineHeight={1.7}>
            Set <Code fontSize="xs">SMTP_HOST</Code>, <Code fontSize="xs">SMTP_PORT</Code>, <Code fontSize="xs">SMTP_USER</Code> and{' '}
            <Code fontSize="xs">SMTP_PASS</Code> (and <Code fontSize="xs">FROM_EMAIL</Code> if it should come from another address) in the server&rsquo;s
            environment, and <Code fontSize="xs">NOTIFY_EMAIL</Code> for where it goes — the same settings as the contact-form notifications. After a restart,
            switch the digest on here.
          </Text>
        </Box>
      ) : null}

      {status && status.smtp && !status.recipient ? (
        <Text fontSize="sm" mt={4} {...warnTextProps}>
          SMTP is set, but no recipient: set <Code fontSize="xs">NOTIFY_EMAIL</Code> (or <Code fontSize="xs">ADMIN_EMAIL</Code>) to the address the digest should go to.
        </Text>
      ) : null}

      {status && ready ? (
        <Flex mt={4} gap={4} align={{ base: 'stretch', md: 'flex-start' }} justify="space-between" flexWrap="wrap">
          <FormControl display="flex" alignItems="flex-start" gap={3} w="auto" flex="1 1 320px">
            <Switch
              id={switchId}
              colorScheme="purple"
              mt={1}
              isChecked={status.enabled}
              isDisabled={busy === 'toggle'}
              onChange={(e) => void toggle(e.target.checked)}
              aria-describedby={`${switchId}-help`}
            />
            <Box>
              <FormLabel htmlFor={switchId} mb={0.5} fontSize="sm" fontWeight={600}>
                Send me the weekly digest
              </FormLabel>
              <FormHelperText id={`${switchId}-help`} mt={0} fontSize="xs" color="page.fg-secondary" maxW="62ch">
                {localSchedule(status.weekday, status.hourUtc)}, for the week before (Monday – Sunday, UTC), to {status.recipient} ({status.recipientSource}).
                {status.enabled && status.nextAt ? ` Next: ${new Date(status.nextAt).toLocaleString('en', { weekday: 'short', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}.` : ''}
              </FormHelperText>
              {status.lastSentAt ? (
                <Text fontSize="xs" color="page.fg-secondary" mt={1}>
                  Last sent {new Date(status.lastSentAt).toLocaleDateString('en', { month: 'short', day: 'numeric' })}
                  {status.lastWeek ? `, for the week of ${formatBucket(status.lastWeek)}` : ''}.
                </Text>
              ) : null}
              {status.lastError ? (
                <Text fontSize="xs" mt={1} {...warnTextProps} role="status">
                  The last attempt failed: {status.lastError}
                </Text>
              ) : null}
            </Box>
          </FormControl>
          <Button size="sm" {...outlineButtonProps} onClick={() => void sendPreview()} isLoading={busy === 'send'} loadingText="Sending" flexShrink={0}>
            Send a preview now
          </Button>
        </Flex>
      ) : null}
    </Panel>
  )
}
