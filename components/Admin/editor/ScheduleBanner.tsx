import { useEffect, useMemo, useState } from 'react'
import { Box, Button, Flex, Text } from '@chakra-ui/react'
import { outlineButtonProps } from '../shell/ui'
import { bothZones, relativeInstant, type ItemScheduleView } from '../shell/itemSchedule'
import { localTimeZone } from '../../../lib/schedule/time'

/**
 * The editor's line about a schedule (H5): when the draft / the saved
 * changes go live and when the item unpublishes — in Hong Kong time and,
 * when it differs, this device's — with "Change…" and a two-step
 * "Unschedule". The relative time ("in 3 h") keeps itself current.
 */
export default function ScheduleBanner({
  schedule,
  noun,
  onChange,
  onClear,
  busy,
}: {
  schedule: ItemScheduleView
  noun: string
  onChange: () => void
  onClear: () => Promise<boolean>
  busy: boolean
}) {
  const [now, setNow] = useState(() => Date.now())
  const [confirm, setConfirm] = useState(false)
  const [clearing, setClearing] = useState(false)
  const zone = useMemo(() => localTimeZone(), [])
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000)
    return () => clearInterval(t)
  }, [])

  const line = (ms: number, verb: string) => {
    const z = bothZones(ms, zone)
    return (
      <Text fontSize="sm">
        {verb}{' '}
        <Text as="span" fontWeight={600} className="tnum">
          {z.site}
        </Text>
        {z.local ? (
          <Text as="span" color="page.fg-secondary" className="tnum">
            {' '}
            · {z.local}
          </Text>
        ) : null}
        <Text as="span" color="page.fg-secondary" whiteSpace={ms <= now ? 'normal' : 'nowrap'}>
          {' '}
          — {ms <= now ? 'due now; the site publishes it within seconds' : relativeInstant(ms, now)}
        </Text>
      </Text>
    )
  }

  const changes = schedule.publishes === 'changes'
  return (
    <Flex
      role="region"
      aria-label="Schedule"
      data-testid="schedule-banner"
      align={{ base: 'flex-start', md: 'center' }}
      direction={{ base: 'column', md: 'row' }}
      gap={3}
      px={4}
      py={3}
      border="1px solid"
      borderColor="accent.text"
      borderRadius="lg"
      bg="var(--accent-soft)"
    >
      <Box flex={1} minW={0}>
        {schedule.publishAt !== null ? line(schedule.publishAt, changes ? 'Changes go live' : 'Publishes') : null}
        {schedule.unpublishAt !== null ? line(schedule.unpublishAt, schedule.publishAt !== null && !changes ? 'Then unpublishes' : 'Unpublishes') : null}
        <Text fontSize="xs" color="page.fg-secondary" mt={0.5}>
          {schedule.publishAt !== null
            ? changes
              ? `Visitors see the published ${noun} until then. Changes you save before then are included.`
              : `It stays a draft until then. Edits you save before then go live with it.`
            : `Visitors see the ${noun} until then; it then goes back to draft.`}
        </Text>
      </Box>
      <Flex gap={2} flexShrink={0} flexWrap="wrap">
        <Button
          size="sm"
          variant={confirm ? 'solid' : 'ghost'}
          colorScheme={confirm ? 'red' : undefined}
          color={confirm ? undefined : 'page.fg-secondary'}
          isLoading={clearing}
          isDisabled={busy}
          loadingText="Unscheduling"
          onBlur={() => setConfirm(false)}
          onClick={async () => {
            if (!confirm) {
              setConfirm(true)
              return
            }
            setClearing(true)
            await onClear()
            setClearing(false)
            setConfirm(false)
          }}
        >
          {confirm ? 'Confirm — unschedule' : 'Unschedule'}
        </Button>
        <Button size="sm" {...outlineButtonProps} onClick={onChange} isDisabled={busy}>
          Change…
        </Button>
      </Flex>
    </Flex>
  )
}
