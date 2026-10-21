import { useEffect, useId, useMemo, useRef, useState, type ReactNode, type RefObject } from 'react'
import {
  Box,
  Button,
  Checkbox,
  Flex,
  FormControl,
  FormLabel,
  Input,
  Modal,
  ModalBody,
  ModalCloseButton,
  ModalContent,
  ModalFooter,
  ModalHeader,
  ModalOverlay,
  Select,
  SimpleGrid,
  Stack,
  Text,
} from '@chakra-ui/react'
import { inputProps, MONO, outlineButtonProps, primaryButtonProps, useWarnFieldProps, warnTextProps } from '../shell/ui'
import { Collapse } from '../../General-UI/Collapse'
import { bothZones, inputsFor, publishTimeProblem, relativeInstant, schedulePresets, type ItemScheduleView, type ScheduleChange } from '../shell/itemSchedule'
import { MIN_WINDOW_MS } from '../../../lib/schedule/fields'
import { SCHEDULE_TIME_ZONE, formatInstant, localTimeZone, toInstantString, zoneCity, zoneLabel, zonedDay, zonedToInstant, offsetLabel } from '../../../lib/schedule/time'
import { formatPostDate } from '../../../lib/postDate'

/**
 * "Schedule…" for posts and case studies (H5): when a draft — or the saved
 * changes of a live item — goes live, and optionally when the item goes back
 * to draft. Times are picked in Hong Kong time (the site's zone) or in this
 * device's zone, and always shown in both; quick picks like a mail client's
 * "schedule send". The publish day can become the item's date (posts:
 * `date`, case studies: `published`), and scheduled changes to a post can
 * be marked as updated on that day. Unsaved edits are saved first. The
 * server publishes on time even with no browser open (lib/schedule).
 */

type Props = {
  isOpen: boolean
  onClose: () => void
  collection: 'blog' | 'work'
  /** 'draft': the item is a draft; 'published': it is live. */
  mode: 'draft' | 'published'
  /** A live item has saved (or unsaved) changes that can be scheduled. */
  hasChanges: boolean
  /** The editor has unsaved edits (they are saved first). */
  dirty: boolean
  schedule: ItemScheduleView | null
  /** The item's date as shown on the page (posts: date; case studies: published), YYYY-MM-DD or ''. */
  itemDate: string
  setSchedule: (change: ScheduleChange) => Promise<{ ok: true } | { ok: false; error: string; code?: string }>
  /**
   * Where focus goes when the dialog closes. The publish sheet's "Schedule…"
   * is gone by then (the sheet closes as the dialog opens), so the opener
   * says where instead; without it Chakra returns focus to the opener.
   */
  finalFocusRef?: RefObject<HTMLElement>
}

type Picked = { date: string; time: string }

const noun = (c: 'blog' | 'work') => (c === 'blog' ? 'post' : 'case study')

function useNow(active: boolean): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!active) return
    setNow(Date.now())
    const t = setInterval(() => setNow(Date.now()), 30_000)
    return () => clearInterval(t)
  }, [active])
  return now
}

export default function ScheduleDialog({ isOpen, onClose, collection, mode, hasChanges, dirty, schedule, itemDate, setSchedule, finalFocusRef }: Props) {
  const ids = useId()
  const now = useNow(isOpen)
  // A time that has passed is a warning, not an error: the fields' ring in the warning colour.
  const warnField = useWarnFieldProps()
  // The first quick pick, or the unpublish switch when there is nothing to publish.
  const firstRef = useRef<HTMLButtonElement & HTMLInputElement>(null)
  const browserZone = useMemo(() => localTimeZone(), [])
  const differentZone = browserZone !== SCHEDULE_TIME_ZONE && offsetLabel(now, browserZone) !== offsetLabel(now, SCHEDULE_TIME_ZONE)
  const [zone, setZone] = useState(SCHEDULE_TIME_ZONE)
  const canPublish = mode === 'draft' || hasChanges
  const [publish, setPublish] = useState<Picked>({ date: '', time: '09:00' })
  const [unpublishOn, setUnpublishOn] = useState(false)
  const [unpublish, setUnpublish] = useState<Picked>({ date: '', time: '09:00' })
  const [dateOption, setDateOption] = useState(false)
  const [busy, setBusy] = useState<'save' | 'clear' | null>(null)
  const [error, setError] = useState('')

  // Start from the stored schedule, else tomorrow 09:00 in Hong Kong.
  useEffect(() => {
    if (!isOpen) return
    const t = Date.now()
    setZone(SCHEDULE_TIME_ZONE)
    setError('')
    const tomorrow = schedulePresets(t, SCHEDULE_TIME_ZONE).find((p) => p.id === 'tomorrow')?.at ?? t + 86_400_000
    setPublish(inputsFor(schedule?.publishAt ?? tomorrow, SCHEDULE_TIME_ZONE))
    setUnpublishOn(schedule?.unpublishAt != null)
    setUnpublish(inputsFor(schedule?.unpublishAt ?? (schedule?.publishAt ?? tomorrow) + 7 * 86_400_000, SCHEDULE_TIME_ZONE))
    const startDay = zonedDay(schedule?.publishAt ?? tomorrow)
    setDateOption(mode === 'draft' ? (collection === 'blog' ? itemDate !== startDay : !!itemDate && itemDate !== startDay) : false)
  }, [isOpen, schedule, mode, collection, itemDate])

  // Switching zones keeps the same instant: the inputs show it in the new zone.
  const changeZone = (next: string) => {
    const p = zonedToInstant(publish.date, publish.time, zone)
    const u = zonedToInstant(unpublish.date, unpublish.time, zone)
    setZone(next)
    if (p !== null) setPublish(inputsFor(p, next))
    if (u !== null) setUnpublish(inputsFor(u, next))
  }

  const publishAt = canPublish ? zonedToInstant(publish.date, publish.time, zone) : null
  const unpublishAt = unpublishOn ? zonedToInstant(unpublish.date, unpublish.time, zone) : null
  const publishProblem = canPublish ? publishTimeProblem(publishAt, now) : null
  const unpublishProblem = !unpublishOn
    ? null
    : unpublishAt === null
      ? 'Pick a date and a time.'
      : unpublishAt - now < 5_000
        ? 'That time has passed.'
        : publishAt !== null && unpublishAt - publishAt < MIN_WINDOW_MS
          ? 'Unpublish after it goes live.'
          : null
  const valid = !publishProblem && !unpublishProblem && (canPublish || unpublishOn)
  // A live item without changes only schedules an unpublish: until it is ticked there is nothing to schedule.
  const nothingPicked = !canPublish && !unpublishOn ? 'Tick “Unpublish automatically” to pick when.' : null
  const msgId = (label: string) => `${ids}-${label}-msg`
  // Why "Schedule" is disabled, for whoever reaches it (the same words as next to the fields).
  const blockedBy = [publishProblem ? msgId('publish') : '', unpublishProblem ? msgId('unpublish') : '', nothingPicked ? `${ids}-nothing` : ''].filter(Boolean).join(' ')
  const publishDayIso = publishAt !== null ? zonedDay(publishAt) : ''
  const presets = useMemo(() => (canPublish ? schedulePresets(now, zone) : []), [canPublish, now, zone])
  const hasStored = !!schedule && (schedule.publishAt !== null || schedule.unpublishAt !== null)

  const submit = async () => {
    if (!valid || busy) return
    setBusy('save')
    setError('')
    const out = await setSchedule({
      publishAt: publishAt !== null ? toInstantString(publishAt) : null,
      unpublishAt: unpublishAt !== null ? toInstantString(unpublishAt) : null,
      ...(dateOption && mode === 'draft' ? { setDate: true } : {}),
      ...(dateOption && mode === 'published' && collection === 'blog' ? { markUpdated: true } : {}),
    })
    setBusy(null)
    if (out.ok) onClose()
    else setError(out.error)
  }

  const clear = async () => {
    setBusy('clear')
    setError('')
    const out = await setSchedule({ publishAt: null, unpublishAt: null })
    setBusy(null)
    if (out.ok) onClose()
    else setError(out.error)
  }

  const zoneSelect = differentZone ? (
    <FormControl maxW={{ base: '100%', sm: '260px' }}>
      <FormLabel fontSize="13px" htmlFor={`${ids}-zone`}>
        Time zone
      </FormLabel>
      <Select {...inputProps} size="sm" id={`${ids}-zone`} value={zone} onChange={(e) => changeZone(e.target.value)}>
        <option value={SCHEDULE_TIME_ZONE}>Hong Kong (HKT · {offsetLabel(now, SCHEDULE_TIME_ZONE)})</option>
        <option value={browserZone}>
          This device ({zoneCity(browserZone)} · {offsetLabel(now, browserZone)})
        </option>
      </Select>
    </FormControl>
  ) : null

  const whenLine = (ms: number | null, verb: string, testId: string) => {
    if (ms === null) return null
    const z = bothZones(ms, browserZone)
    return (
      <Text fontSize="sm" data-testid={testId}>
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
        <Text as="span" color="page.fg-secondary" whiteSpace="nowrap">
          {' '}
          — {relativeInstant(ms, now)}
        </Text>
      </Text>
    )
  }

  /**
   * A picker's date and time, and under them ONE message that is always in
   * the page — what is wrong with the time ("That time has passed…", "Pick a
   * date and a time.", also for an emptied date) or when it happens — as a
   * polite live region, so a change of either is announced. While something
   * is wrong both fields are invalid and described by it.
   */
  const pickers = (value: Picked, onChange: (v: Picked) => void, label: string, problem: string | null, when: ReactNode) => {
    const invalid = problem ? { isInvalid: true, 'aria-describedby': msgId(label), ...warnField } : {}
    return (
      <>
        <SimpleGrid columns={2} spacing={3} maxW="360px">
          <FormControl>
            <FormLabel fontSize="13px" htmlFor={`${ids}-${label}-date`}>
              Date
            </FormLabel>
            <Input {...inputProps} size="sm" type="date" id={`${ids}-${label}-date`} value={value.date} onChange={(e) => onChange({ ...value, date: e.target.value })} className="tnum" {...invalid} />
          </FormControl>
          <FormControl>
            <FormLabel fontSize="13px" htmlFor={`${ids}-${label}-time`}>
              Time ({zone === SCHEDULE_TIME_ZONE ? 'HKT' : zoneLabel(now, zone)})
            </FormLabel>
            <Input {...inputProps} size="sm" type="time" step={60} id={`${ids}-${label}-time`} value={value.time} onChange={(e) => onChange({ ...value, time: e.target.value })} className="tnum" {...invalid} />
          </FormControl>
        </SimpleGrid>
        <Box id={msgId(label)} aria-live="polite" mt={2} data-testid={`schedule-${label}-msg`}>
          {problem ? (
            <Text fontSize="xs" {...warnTextProps}>
              {problem}
            </Text>
          ) : (
            when
          )}
        </Box>
      </>
    )
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} initialFocusRef={firstRef} finalFocusRef={finalFocusRef} size="lg" isCentered scrollBehavior="inside">
      <ModalOverlay />
      <ModalContent bg="page.bg-elevated" border="1px solid" borderColor="page.border" mx={4} data-testid="schedule-dialog">
        <ModalHeader fontSize="md" pb={1} pr={12}>
          {canPublish ? (mode === 'draft' ? `Schedule this ${noun(collection)}` : 'Schedule these changes') : `Unpublish this ${noun(collection)} later`}
        </ModalHeader>
        <ModalCloseButton />
        <ModalBody>
          <Stack spacing={5}>
            <Text fontSize="sm" color="page.fg-secondary">
              {canPublish
                ? mode === 'draft'
                  ? 'The site publishes it at that time — no need to be online. Until then it stays a draft; edits you save before then go live with it.'
                  : 'Visitors keep the published version until then; the saved changes go live at that time. Edits you save before then are included.'
                : `It is live now. Pick when it should go back to draft — for a time-limited announcement, say. Save changes first to schedule them instead.`}
            </Text>

            {canPublish ? (
              <Box as="fieldset">
                <Text as="legend" fontSize="13px" fontWeight={600} mb={2}>
                  {mode === 'draft' ? 'Publish' : 'Publish the changes'}
                </Text>
                {presets.length ? (
                  <Flex gap={2} wrap="wrap" mb={3} role="group" aria-label="Quick picks">
                    {presets.map((p, i) => {
                      const v = inputsFor(p.at, zone)
                      const selected = v.date === publish.date && v.time === publish.time
                      return (
                        <Button
                          key={p.id}
                          ref={i === 0 ? firstRef : undefined}
                          size="sm"
                          {...outlineButtonProps}
                          borderColor={selected ? 'accent.text' : 'page.border-strong'}
                          aria-pressed={selected}
                          onClick={() => setPublish(v)}
                          h="auto"
                          py={1.5}
                          flexDirection="column"
                          alignItems="flex-start"
                        >
                          <Text as="span" fontSize="13px" fontWeight={500}>
                            {p.label}
                          </Text>
                          <Text as="span" fontSize="11px" color="page.fg-secondary" fontFamily={MONO} className="tnum">
                            {formatInstant(p.at, zone, { year: false })}
                          </Text>
                        </Button>
                      )
                    })}
                  </Flex>
                ) : null}
                {pickers(publish, setPublish, 'publish', publishProblem, whenLine(publishAt, 'Goes live', 'schedule-publish-when'))}
                {mode === 'draft' && publishDayIso ? (
                  <Checkbox mt={3} colorScheme="accent" isChecked={dateOption} onChange={(e) => setDateOption(e.target.checked)} alignItems="flex-start">
                    <Text as="span" fontSize="sm">
                      {collection === 'blog' ? 'Date the post on the day it goes live' : 'Set the publication date to the day it goes live'} ({formatPostDate(publishDayIso)})
                    </Text>
                    <Text as="span" display="block" fontSize="xs" color="page.fg-secondary">
                      {itemDate ? `Now ${formatPostDate(itemDate)}.` : 'It has no date yet.'} The day is counted in Hong Kong time.
                    </Text>
                  </Checkbox>
                ) : null}
                {mode === 'published' && collection === 'blog' && publishDayIso ? (
                  <Checkbox mt={3} colorScheme="accent" isChecked={dateOption} onChange={(e) => setDateOption(e.target.checked)} alignItems="flex-start">
                    <Text as="span" fontSize="sm">
                      Mark as updated on that day ({formatPostDate(publishDayIso)})
                    </Text>
                    <Text as="span" display="block" fontSize="xs" color="page.fg-secondary">
                      Shows “Updated” on the post and tells search engines and feeds it changed. Leave off for small fixes.
                    </Text>
                  </Checkbox>
                ) : null}
              </Box>
            ) : null}

            <Box as="fieldset">
              <Checkbox
                ref={canPublish ? undefined : firstRef}
                colorScheme="accent"
                isChecked={unpublishOn}
                onChange={(e) => setUnpublishOn(e.target.checked)}
                alignItems="flex-start"
              >
                <Text as="span" fontSize="sm" fontWeight={500}>
                  {canPublish && mode === 'draft' ? 'Unpublish it again later' : 'Unpublish automatically'}
                </Text>
                <Text as="span" display="block" fontSize="xs" color="page.fg-secondary">
                  Back to draft at that time: the page answers 404 and leaves the lists, feeds and sitemap.
                </Text>
              </Checkbox>
              {nothingPicked ? (
                <Text id={`${ids}-nothing`} fontSize="xs" mt={2} pl={6} color="page.fg-secondary">
                  {nothingPicked}
                </Text>
              ) : null}
              <Collapse open={unpublishOn} id={`${ids}-unpublish`}>
                <Box pt={3} pl={{ base: 0, sm: 6 }}>
                  {pickers(unpublish, setUnpublish, 'unpublish', unpublishProblem, whenLine(unpublishAt, 'Unpublishes', 'schedule-unpublish-when'))}
                </Box>
              </Collapse>
            </Box>

            {zoneSelect}

            {dirty ? (
              <Text fontSize="sm" {...warnTextProps}>
                Your unsaved edits are saved first{mode === 'published' ? ' (as unpublished changes)' : ''}.
              </Text>
            ) : null}
            {error ? (
              <Text fontSize="sm" color="status.error" role="alert">
                {error}
              </Text>
            ) : null}
          </Stack>
        </ModalBody>
        <ModalFooter gap={2} flexWrap="wrap">
          {hasStored ? (
            <Button size="sm" variant="ghost" color="page.fg-secondary" mr="auto" onClick={() => void clear()} isLoading={busy === 'clear'} isDisabled={!!busy} loadingText="Unscheduling">
              Unschedule
            </Button>
          ) : null}
          <Button size="sm" {...outlineButtonProps} onClick={onClose}>
            Cancel
          </Button>
          <Button
            size="sm"
            {...primaryButtonProps}
            onClick={() => void submit()}
            isDisabled={!valid || !!busy}
            isLoading={busy === 'save'}
            loadingText="Scheduling"
            aria-describedby={!valid && blockedBy ? blockedBy : undefined}
          >
            {dirty ? 'Save & schedule' : hasStored ? 'Update schedule' : 'Schedule'}
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  )
}
