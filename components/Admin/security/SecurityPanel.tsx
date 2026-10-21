import { useCallback, useEffect, useRef, useState } from 'react'
import {
  Alert,
  AlertDescription,
  AlertDialog,
  AlertDialogBody,
  AlertDialogContent,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogOverlay,
  AlertIcon,
  Badge,
  Box,
  Button,
  Flex,
  FormControl,
  FormHelperText,
  FormLabel,
  Input,
  Modal,
  ModalBody,
  ModalCloseButton,
  ModalContent,
  ModalFooter,
  ModalHeader,
  ModalOverlay,
  Skeleton,
  Switch,
  Text,
  useToast,
} from '@chakra-ui/react'
import {
  MONO,
  Panel,
  SectionLabel,
  inputProps,
  outlineButtonProps,
  primaryButtonProps,
  warnTextProps,
} from '../shell/ui'
import { readJsonObject } from '../shell/http'
import { NETWORK_ERROR } from '../shell/authMessages'
import { KeyIcon, ShieldIcon } from './icons'
import { useStepUp } from './useStepUp'
import { wasStepUpCancelled } from './stepUpClient'
import RecoveryCodesDialog from './RecoveryCodesDialog'
import PasswordCard, { type PasswordInfo } from './PasswordCard'
import {
  absoluteTime,
  eventLabel,
  failureCountriesLabel,
  failureKindLabel,
  methodLabel,
  passkeySyncLabel,
  relativeTime,
  whereLabel,
} from './securityFormat'
import {
  createPasskey,
  describeWebAuthnError,
  isCeremonyCancelled,
  passkeysPossibleHere,
  syncAcceptedPasskeys,
} from './webauthnClient'

type Passkey = {
  id: string
  name: string
  createdAt: number
  lastUsedAt: number | null
  deviceType: string
  backedUp: boolean
  provider: string | null
}

type Session = {
  id: string
  current: boolean
  createdAt: number
  lastSeenAt: number
  method: string
  device: string | null
  ipPrefix: string | null
  country: string | null
}

type AuthEventRow = {
  id: number
  at: number
  type: string
  method: string | null
  device: string | null
  ipPrefix: string | null
  country: string | null
  detail: string | null
}

type FailureSummary = {
  last24h: number
  last7d: number
  last30d: number
  lastAt: number | null
  byMethod: Array<{ type: string; method: string | null; count: number }>
  byCountry: Array<{ country: string | null; count: number }>
}

type Overview = {
  rp: { id: string | null; available: boolean }
  userId?: string
  passkeys: Passkey[]
  recovery: { total: number; remaining: number; generatedAt: number | null }
  policy: { passkeyRequired: boolean }
  sessions: Session[]
  current: { sessionId: string | null; verifiedAt: number | null; recentUntil: number | null }
  legacySessions: boolean
  events: AuthEventRow[]
  failures: FailureSummary
  stepUp: { windowMinutes: number }
  /** Absent only from a server older than the Password card. */
  password?: PasswordInfo
}

const ROW = {
  as: 'li' as const,
  px: { base: 3, md: 4 },
  py: 3,
  borderBottom: '1px solid',
  borderColor: 'page.border',
  _last: { borderBottom: 'none' },
}

/** "1 minute", "10 minutes". */
const minutesLabel = (n: number) => `${n} minute${n === 1 ? '' : 's'}`

function Meta({ children }: { children: React.ReactNode }) {
  return (
    <Text fontFamily={MONO} fontSize="11px" color="page.fg-secondary" className="tnum">
      {children}
    </Text>
  )
}

/**
 * Failed sign-ins and identity checks of the last 30 days, summed: the
 * server only counts them (per hour, method and country), so a flood of
 * them can never push a sign-in out of the history list below.
 */
function FailedAttempts({ summary, now }: { summary: FailureSummary; now: number }) {
  if (summary.last30d === 0) {
    return (
      <Text fontSize="sm" color="page.fg-secondary" mb={3}>
        No failed sign-in attempts in the last 30 days.
      </Text>
    )
  }
  const recent = summary.last24h > 0
  return (
    <Box
      as="section"
      aria-labelledby="security-failures"
      border="1px solid"
      borderColor="page.border"
      borderRadius="lg"
      px={{ base: 3, md: 4 }}
      py={3}
      mb={3}
    >
      <Flex align="baseline" justify="space-between" gap={3} flexWrap="wrap">
        <Text
          as="h3"
          id="security-failures"
          fontSize="sm"
          fontWeight={600}
          color={recent ? 'status.warning' : undefined}
        >
          Failed attempts
        </Text>
        {summary.lastAt ? (
          <Meta>
            last{' '}
            <time
              dateTime={new Date(summary.lastAt).toISOString()}
              title={absoluteTime(summary.lastAt)}
            >
              {relativeTime(summary.lastAt, now)}
            </time>
          </Meta>
        ) : null}
      </Flex>
      <Box
        as="dl"
        display="grid"
        gridTemplateColumns="repeat(3, minmax(0, max-content))"
        columnGap={{ base: 6, md: 10 }}
        mt={2}
      >
        {[
          { label: '24 hours', value: summary.last24h },
          { label: '7 days', value: summary.last7d },
          { label: '30 days', value: summary.last30d },
        ].map((w) => (
          <Box key={w.label} minW={0}>
            <Text as="dt" fontFamily={MONO} fontSize="11px" color="page.fg-secondary">
              {w.label}
            </Text>
            <Text as="dd" fontSize="md" fontWeight={600} className="tnum">
              {w.value.toLocaleString('en')}
            </Text>
          </Box>
        ))}
      </Box>
      <Text fontSize="xs" color="page.fg-secondary" mt={2}>
        {summary.byMethod.map((m) => failureKindLabel(m.type, m.method, m.count)).join(' · ')}
      </Text>
      {/* Only when Cloudflare named at least one country (locally it names none). */}
      {summary.byCountry.some((c) => c.country) ? (
        <Text fontSize="xs" color="page.fg-secondary" mt={0.5}>
          By country: {failureCountriesLabel(summary.byCountry)}
        </Text>
      ) : null}
    </Box>
  )
}

/**
 * Admin → Security: passkeys, recovery codes, the password, the "Require a
 * passkey" policy, signed-in browsers and the sign-in history (server:
 * /api/admin/security/*). Every change that weakens or replaces a way in asks
 * for a recent verification first (useStepUp) — except the password change
 * while the password may sign in: its current-password field is that check
 * (PasswordCard).
 */
export default function SecurityPanel() {
  const toast = useToast()
  const { fetchWithStepUp, stepUpElement } = useStepUp()
  const [data, setData] = useState<Overview | null>(null)
  const [loadError, setLoadError] = useState('')
  const [now, setNow] = useState(() => Date.now())
  const [adding, setAdding] = useState(false)
  const [codes, setCodes] = useState<string[] | null>(null)
  const [renaming, setRenaming] = useState<Passkey | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const [removing, setRemoving] = useState<Passkey | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [canPasskey, setCanPasskey] = useState(true)
  const cancelRef = useRef<HTMLButtonElement>(null)

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/security', { cache: 'no-store' })
      if (res.status === 401) {
        window.location.href = `/admin/login?next=${encodeURIComponent('/admin/security')}`
        return
      }
      const json = await readJsonObject(res)
      if (!res.ok)
        throw new Error(typeof json.error === 'string' ? json.error : `HTTP ${res.status}`)
      setData(json as Overview)
      setNow(Date.now())
      setLoadError('')
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : NETWORK_ERROR)
    }
  }, [])

  useEffect(() => {
    void load()
    setCanPasskey(passkeysPossibleHere())
    const id = window.setInterval(() => setNow(Date.now()), 30_000)
    return () => window.clearInterval(id)
  }, [load])

  const fail = (title: string, res: Response | null, json: Record<string, unknown> = {}) => {
    if (res && wasStepUpCancelled(res)) return
    toast({
      status: 'error',
      title,
      description:
        typeof json.error === 'string' ? json.error : res ? `HTTP ${res.status}` : NETWORK_ERROR,
      duration: 6000,
    })
  }

  const jsonInit = (method: string, body: unknown): RequestInit => ({
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })

  const addPasskey = async () => {
    if (adding) return
    setAdding(true)
    try {
      const optRes = await fetchWithStepUp(
        '/api/admin/security/passkeys',
        jsonInit('POST', { action: 'options' }),
        'Adding a passkey creates a new way to sign in to the admin.'
      )
      const optJson = await readJsonObject(optRes)
      if (!optRes.ok || !optJson.options) return fail('Could not add a passkey', optRes, optJson)
      let response: unknown
      try {
        response = await createPasskey(optJson.options)
      } catch (err) {
        if (!isCeremonyCancelled(err))
          toast({
            status: 'error',
            title: 'Passkey not added',
            description: describeWebAuthnError(err),
            duration: 6000,
          })
        return
      }
      const res = await fetchWithStepUp(
        '/api/admin/security/passkeys',
        jsonInit('POST', { action: 'register', response }),
        'Adding a passkey creates a new way to sign in to the admin.'
      )
      const json = await readJsonObject(res)
      if (!res.ok) return fail('Passkey not added', res, json)
      toast({
        status: 'success',
        title: 'Passkey added',
        description: typeof json.passkey?.name === 'string' ? json.passkey.name : undefined,
      })
      if (Array.isArray(json.recoveryCodes)) setCodes(json.recoveryCodes as string[])
      await load()
    } catch {
      fail('Could not add a passkey', null)
    } finally {
      setAdding(false)
    }
  }

  const rename = async () => {
    if (!renaming) return
    setBusy(`rename:${renaming.id}`)
    try {
      const res = await fetch(
        '/api/admin/security/passkeys',
        jsonInit('PATCH', { id: renaming.id, name: renameValue })
      )
      const json = await readJsonObject(res)
      if (!res.ok) return fail('Not renamed', res, json)
      setRenaming(null)
      await load()
    } catch {
      fail('Not renamed', null)
    } finally {
      setBusy(null)
    }
  }

  const remove = async () => {
    if (!removing) return
    const target = removing
    setBusy(`remove:${target.id}`)
    try {
      const res = await fetchWithStepUp(
        '/api/admin/security/passkeys',
        jsonInit('DELETE', { id: target.id }),
        `Removing “${target.name}” means it can no longer sign in.`
      )
      const json = await readJsonObject(res)
      setRemoving(null)
      if (!res.ok) return fail('Passkey not removed', res, json)
      toast({ status: 'success', title: 'Passkey removed', description: target.name })
      const remaining = (data?.passkeys || []).filter((p) => p.id !== target.id).map((p) => p.id)
      if (data?.rp.id && data.userId) void syncAcceptedPasskeys(data.rp.id, data.userId, remaining)
      await load()
    } catch {
      fail('Passkey not removed', null)
    } finally {
      setBusy(null)
    }
  }

  const newCodes = async () => {
    setBusy('codes')
    try {
      const res = await fetchWithStepUp(
        '/api/admin/security/recovery-codes',
        jsonInit('POST', {}),
        'New recovery codes replace every code you saved before.'
      )
      const json = await readJsonObject(res)
      if (!res.ok || !Array.isArray(json.codes)) return fail('No new codes', res, json)
      setCodes(json.codes as string[])
      await load()
    } catch {
      fail('No new codes', null)
    } finally {
      setBusy(null)
    }
  }

  const setPolicy = async (on: boolean) => {
    setBusy('policy')
    try {
      const res = await fetchWithStepUp(
        '/api/admin/security/policy',
        jsonInit('PUT', { passkeyRequired: on }),
        on
          ? 'Requiring a passkey changes how the admin signs in.'
          : 'Allowing the password alone again makes sign-in weaker.'
      )
      const json = await readJsonObject(res)
      if (!res.ok) return fail('Policy not changed', res, json)
      toast({
        status: 'success',
        title: on ? 'A passkey is now required' : 'The password alone signs in again',
      })
      if (Array.isArray(json.recoveryCodes)) setCodes(json.recoveryCodes as string[])
      await load()
    } catch {
      fail('Policy not changed', null)
    } finally {
      setBusy(null)
    }
  }

  const signOut = async (
    body: Record<string, unknown>,
    key: string,
    reason: string,
    title: string
  ) => {
    setBusy(key)
    try {
      const res = await fetchWithStepUp(
        '/api/admin/security/sessions',
        jsonInit('DELETE', body),
        reason
      )
      const json = await readJsonObject(res)
      if (!res.ok) return fail('Not signed out', res, json)
      if (
        body.all === true ||
        (typeof body.id === 'string' && body.id === data?.current.sessionId)
      ) {
        window.location.href = '/admin/login'
        return
      }
      toast({ status: 'success', title })
      await load()
    } catch {
      fail('Not signed out', null)
    } finally {
      setBusy(null)
    }
  }

  const verifyNow = async () => {
    setBusy('verify')
    try {
      const res = await fetchWithStepUp(
        '/api/admin/security/confirm',
        { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' },
        'Confirm it’s you now, so the next dangerous actions don’t have to ask.'
      )
      if (res.ok)
        toast({
          status: 'success',
          title: 'Verified',
          description: `Dangerous actions won’t ask again for ${minutesLabel(data?.stepUp.windowMinutes ?? 10)}.`,
        })
      await load()
    } catch {
      fail('Not verified', null)
    } finally {
      setBusy(null)
    }
  }

  if (loadError && !data) {
    return (
      <Alert status="error" variant="left-accent" borderRadius="md" bg="page.bg-elevated">
        <AlertIcon />
        <AlertDescription fontSize="sm" flex={1}>
          Couldn’t load the security settings ({loadError}).
        </AlertDescription>
        <Button size="sm" {...outlineButtonProps} onClick={() => void load()}>
          Retry
        </Button>
      </Alert>
    )
  }

  if (!data) {
    return (
      <Box aria-busy="true" aria-label="Loading security settings">
        <Skeleton h="88px" borderRadius="xl" />
        <Skeleton h="180px" borderRadius="xl" mt={6} />
        <Skeleton h="140px" borderRadius="xl" mt={6} />
      </Box>
    )
  }

  const recentLeft = data.current.recentUntil
    ? Math.max(0, Math.ceil((data.current.recentUntil - now) / 60_000))
    : 0
  const passkeyCount = data.passkeys.length

  return (
    <Box>
      {/* Status strip (2 × 2 on phones, one row from md up) */}
      <Box mb={2}>
        <Panel
          as="section"
          aria-label="Security status"
          display="grid"
          gridTemplateColumns={{
            base: 'repeat(2, minmax(0, 1fr))',
            md: 'repeat(4, minmax(0, 1fr))',
          }}
          p={0}
          overflow="hidden"
        >
          {[
            {
              label: 'Passkeys',
              value: String(passkeyCount),
              sub:
                passkeyCount === 0
                  ? 'none yet'
                  : passkeyCount === 1
                    ? 'add a second one'
                    : 'registered',
            },
            {
              label: 'Recovery codes',
              value: data.recovery.total
                ? `${data.recovery.remaining}/${data.recovery.total}`
                : '—',
              sub: data.recovery.total ? 'unused' : 'created with the first passkey',
            },
            {
              label: 'Sign-in',
              value: data.policy.passkeyRequired ? 'Passkey' : 'Password or passkey',
              sub: data.policy.passkeyRequired
                ? 'password needs a recovery code'
                : 'password alone works',
            },
            {
              label: 'This browser',
              value: recentLeft > 0 ? 'Verified' : 'Not recent',
              sub:
                recentLeft > 0 ? `${recentLeft} min left` : `checks again before dangerous actions`,
            },
          ].map((c, i) => (
            <Box
              key={c.label}
              px={4}
              py={3}
              // Widths only per breakpoint: a responsive `border` shorthand would
              // reset the colour to currentColor inside the media query.
              borderStyle="solid"
              borderColor="page.border"
              borderWidth={{
                base: `0 ${i % 2 === 0 ? '1px' : '0'} ${i < 2 ? '1px' : '0'} 0`,
                md: `0 ${i < 3 ? '1px' : '0'} 0 0`,
              }}
              minW={0}
            >
              <Text
                fontFamily={MONO}
                fontSize="10px"
                letterSpacing="0.12em"
                textTransform="uppercase"
                color="page.fg-secondary"
              >
                <Box as="span" color="accent.text" mr={1.5}>
                  [{String(i + 1).padStart(2, '0')}]
                </Box>
                {c.label}
              </Text>
              <Text fontSize="md" fontWeight={600} mt={1} className="tnum">
                {c.value}
              </Text>
              <Text fontSize="xs" color="page.fg-secondary">
                {c.sub}
              </Text>
            </Box>
          ))}
        </Panel>
        {recentLeft === 0 ? (
          <Flex mt={3} justify="flex-end">
            <Button
              size="sm"
              leftIcon={<ShieldIcon />}
              {...outlineButtonProps}
              onClick={() => void verifyNow()}
              isLoading={busy === 'verify'}
            >
              Confirm it’s me now
            </Button>
          </Flex>
        ) : null}
      </Box>

      {/* Passkeys */}
      <SectionLabel
        index={1}
        title="Passkeys"
        id="security-passkeys"
        hint={
          <>
            Sign in with Face ID, Touch ID, Windows Hello, your phone or a security key. A passkey
            only works on{' '}
            <Box as="span" fontFamily={MONO}>
              {data.rp.id || 'this site'}
            </Box>
            , so a look-alike site can’t phish it.
          </>
        }
        action={
          <Button
            size="sm"
            leftIcon={<KeyIcon />}
            {...primaryButtonProps}
            onClick={() => void addPasskey()}
            isLoading={adding}
            loadingText="Waiting…"
            isDisabled={!data.rp.available || !canPasskey}
          >
            Add a passkey
          </Button>
        }
      />
      {!data.rp.available ? (
        <Alert
          status="warning"
          variant="left-accent"
          borderRadius="md"
          bg="page.bg-elevated"
          mb={3}
          fontSize="sm"
        >
          <AlertIcon />
          <AlertDescription>
            Passkeys need a host name. Open the admin through the site’s own address (or localhost),
            not an IP address.
          </AlertDescription>
        </Alert>
      ) : !canPasskey ? (
        <Alert
          status="warning"
          variant="left-accent"
          borderRadius="md"
          bg="page.bg-elevated"
          mb={3}
          fontSize="sm"
        >
          <AlertIcon />
          <AlertDescription>This browser doesn’t support passkeys.</AlertDescription>
        </Alert>
      ) : null}
      {passkeyCount === 0 ? (
        <Text fontSize="sm" color="page.fg-secondary">
          No passkey yet. Add one on each device you use for the admin — your first one also creates
          ten recovery codes.
        </Text>
      ) : (
        <Box
          as="ul"
          listStyleType="none"
          border="1px solid"
          borderColor="page.border"
          borderRadius="lg"
          aria-labelledby="security-passkeys"
        >
          {data.passkeys.map((p) => (
            <Flex key={p.id} {...ROW} align="center" gap={3} flexWrap="wrap">
              <Flex
                w="32px"
                h="32px"
                borderRadius="md"
                bg="var(--accent-soft)"
                color="accent.text"
                align="center"
                justify="center"
                flexShrink={0}
              >
                <KeyIcon />
              </Flex>
              <Box flex="1 1 220px" minW={0}>
                <Text fontSize="sm" fontWeight={600} noOfLines={1}>
                  {p.name}
                </Text>
                <Meta>
                  {passkeySyncLabel(p)} · added{' '}
                  <time
                    dateTime={new Date(p.createdAt).toISOString()}
                    title={absoluteTime(p.createdAt)}
                  >
                    {relativeTime(p.createdAt, now)}
                  </time>
                  {' · '}
                  {p.lastUsedAt ? (
                    <>
                      last used{' '}
                      <time
                        dateTime={new Date(p.lastUsedAt).toISOString()}
                        title={absoluteTime(p.lastUsedAt)}
                      >
                        {relativeTime(p.lastUsedAt, now)}
                      </time>
                    </>
                  ) : (
                    'not used yet'
                  )}
                </Meta>
              </Box>
              <Flex gap={2}>
                <Button
                  size="xs"
                  variant="ghost"
                  aria-label={`Rename passkey ${p.name}`}
                  onClick={() => {
                    setRenaming(p)
                    setRenameValue(p.name)
                  }}
                >
                  Rename
                </Button>
                <Button
                  size="xs"
                  {...outlineButtonProps}
                  aria-label={`Remove passkey ${p.name}`}
                  onClick={() => setRemoving(p)}
                  isLoading={busy === `remove:${p.id}`}
                >
                  Remove
                </Button>
              </Flex>
            </Flex>
          ))}
        </Box>
      )}
      {passkeyCount === 1 ? (
        <Text fontSize="xs" color="page.fg-secondary" mt={2}>
          Add a second passkey on another device (or a password manager), so losing one device
          doesn’t lock you out.
        </Text>
      ) : null}

      {/* Recovery codes */}
      <SectionLabel
        index={2}
        title="Recovery codes"
        id="security-recovery"
        hint="One-time codes for when no passkey is at hand. Keep them offline — printed, or in a password manager. Only their fingerprints are stored here."
        action={
          <Button
            size="sm"
            {...outlineButtonProps}
            onClick={() => void newCodes()}
            isLoading={busy === 'codes'}
            isDisabled={passkeyCount === 0 && data.recovery.total === 0}
          >
            {data.recovery.total ? 'Create new codes' : 'Create codes'}
          </Button>
        }
      />
      <Text fontSize="sm">
        {data.recovery.total ? (
          <>
            <Box as="span" fontWeight={600} className="tnum">
              {data.recovery.remaining} of {data.recovery.total}
            </Box>{' '}
            unused
            {data.recovery.generatedAt ? (
              <> · created {absoluteTime(data.recovery.generatedAt)}</>
            ) : null}
            .{data.recovery.remaining <= 3 ? ' Running low — create a new set.' : ''}
          </>
        ) : (
          <Box as="span" color="page.fg-secondary">
            No codes yet. They are created with your first passkey.
          </Box>
        )}
      </Text>

      {/* Password */}
      {data.password ? (
        <PasswordCard
          index={3}
          info={data.password}
          passkeyOnly={data.policy.passkeyRequired && passkeyCount > 0}
          otherBrowsers={data.sessions.filter((s) => !s.current).length}
          now={now}
          fetchWithStepUp={fetchWithStepUp}
          onChanged={load}
        />
      ) : null}

      {/* Policy */}
      <SectionLabel index={4} title="Sign-in policy" id="security-policy" />
      <FormControl display="flex" alignItems="flex-start" gap={3}>
        <Switch
          id="passkey-required"
          colorScheme="purple"
          mt={1}
          isChecked={data.policy.passkeyRequired}
          isDisabled={passkeyCount === 0 || busy === 'policy'}
          onChange={(e) => void setPolicy(e.target.checked)}
          aria-describedby="passkey-required-help"
        />
        <Box>
          <FormLabel htmlFor="passkey-required" mb={0.5} fontSize="sm" fontWeight={600}>
            Require a passkey
          </FormLabel>
          <FormHelperText
            id="passkey-required-help"
            mt={0}
            fontSize="xs"
            color="page.fg-secondary"
            maxW="62ch"
          >
            When on, the password alone can’t sign in or confirm dangerous actions — it needs one of
            your recovery codes as well. Turn it on once you have passkeys on two devices and your
            recovery codes are saved.
            {passkeyCount === 0 ? ' Add a passkey first.' : ''}
          </FormHelperText>
        </Box>
      </FormControl>

      {/* Sessions */}
      <SectionLabel
        index={5}
        title="Signed-in browsers"
        id="security-sessions"
        hint={
          data.legacySessions
            ? 'Every browser signed in to the admin. Signing one out ends its session on its next request. Browsers signed in before the passkey update appear here only after their next page view — signing out any browser, this one included, also ends every one of those.'
            : 'Every browser signed in to the admin. Signing one out ends its session on its next request.'
        }
        action={
          <Flex gap={2} flexWrap="wrap">
            <Button
              size="sm"
              {...outlineButtonProps}
              // While a browser from before the passkey update may still be
              // signed in (it is never listed), there is always something to end.
              isDisabled={
                !data.legacySessions && data.sessions.filter((s) => !s.current).length === 0
              }
              isLoading={busy === 'others'}
              onClick={() =>
                void signOut(
                  { others: true },
                  'others',
                  'Signing out every other browser ends their sessions.',
                  'Other browsers signed out'
                )
              }
            >
              Sign out other browsers
            </Button>
            <Button
              size="sm"
              variant="ghost"
              color="status.error"
              isLoading={busy === 'all'}
              onClick={() =>
                void signOut(
                  { all: true },
                  'all',
                  'Signing out everywhere ends every session, this one included.',
                  'Signed out everywhere'
                )
              }
            >
              Sign out everywhere
            </Button>
          </Flex>
        }
      />
      <Box
        as="ul"
        listStyleType="none"
        border="1px solid"
        borderColor="page.border"
        borderRadius="lg"
        aria-labelledby="security-sessions"
      >
        {data.sessions.length === 0 ? (
          <Box {...ROW}>
            <Text fontSize="sm" color="page.fg-secondary">
              This browser signed in before sessions were tracked; it appears here after the next
              page load.
            </Text>
          </Box>
        ) : null}
        {data.sessions.map((s) => (
          <Flex key={s.id} {...ROW} align="center" gap={3} flexWrap="wrap">
            <Box flex="1 1 240px" minW={0}>
              <Flex align="center" gap={2} flexWrap="wrap">
                <Text fontSize="sm" fontWeight={600}>
                  {s.device || 'Unknown device'}
                </Text>
                {s.current ? (
                  <Badge variant="subtle" colorScheme="purple" fontFamily={MONO} fontSize="9px">
                    this browser
                  </Badge>
                ) : null}
              </Flex>
              <Meta>
                {whereLabel(s.country, s.ipPrefix)} · {methodLabel(s.method)} · signed in{' '}
                <time
                  dateTime={new Date(s.createdAt).toISOString()}
                  title={absoluteTime(s.createdAt)}
                >
                  {relativeTime(s.createdAt, now)}
                </time>{' '}
                · active{' '}
                <time
                  dateTime={new Date(s.lastSeenAt).toISOString()}
                  title={absoluteTime(s.lastSeenAt)}
                >
                  {relativeTime(s.lastSeenAt, now)}
                </time>
              </Meta>
            </Box>
            <Button
              size="xs"
              {...outlineButtonProps}
              aria-label={
                s.current
                  ? 'Sign out this browser'
                  : `Sign out ${s.device || 'browser'} (${whereLabel(s.country, s.ipPrefix)})`
              }
              isLoading={busy === `session:${s.id}`}
              onClick={() =>
                void signOut(
                  { id: s.id },
                  `session:${s.id}`,
                  'Signing out another browser ends its session.',
                  'Browser signed out'
                )
              }
            >
              Sign out
            </Button>
          </Flex>
        ))}
      </Box>

      {/* History */}
      <SectionLabel
        index={6}
        title="Sign-in history"
        id="security-history"
        hint="The last 40 sign-ins and security changes. Failed attempts are only counted (per hour, method and country — no address or device), so they can never push an entry out of this list."
      />
      <FailedAttempts summary={data.failures} now={now} />
      {data.events.length === 0 ? (
        <Text fontSize="sm" color="page.fg-secondary">
          No sign-ins or security changes recorded yet.
        </Text>
      ) : (
        <Box
          as="ol"
          listStyleType="none"
          border="1px solid"
          borderColor="page.border"
          borderRadius="lg"
          aria-labelledby="security-history"
        >
          {data.events.map((e) => (
            <Flex key={e.id} {...ROW} as="li" gap={3} align="baseline" flexWrap="wrap">
              <Text
                as="time"
                dateTime={new Date(e.at).toISOString()}
                title={absoluteTime(e.at)}
                fontFamily={MONO}
                fontSize="11px"
                color="page.fg-secondary"
                minW="96px"
                className="tnum"
              >
                {relativeTime(e.at, now)}
              </Text>
              <Box flex="1 1 240px" minW={0}>
                <Text fontSize="sm" fontWeight={500}>
                  {eventLabel(e.type)}
                  {e.detail ? (
                    <Box as="span" fontWeight={400} color="page.fg-secondary">
                      {' '}
                      — {e.detail}
                    </Box>
                  ) : null}
                </Text>
                <Meta>
                  {[
                    e.method ? methodLabel(e.method) : '',
                    e.device || '',
                    e.country || e.ipPrefix ? whereLabel(e.country, e.ipPrefix) : '',
                  ]
                    .filter(Boolean)
                    .join(' · ') || '—'}
                </Meta>
              </Box>
            </Flex>
          ))}
        </Box>
      )}

      {/* Dialogs */}
      <Modal isOpen={!!renaming} onClose={() => setRenaming(null)} isCentered size="sm">
        <ModalOverlay />
        <ModalContent bg="page.bg-elevated" border="1px solid" borderColor="page.border" mx={4}>
          <form
            onSubmit={(e) => {
              e.preventDefault()
              void rename()
            }}
          >
            <ModalHeader fontSize="md">Rename passkey</ModalHeader>
            <ModalCloseButton />
            <ModalBody>
              <FormControl>
                <FormLabel fontSize="12px">Name</FormLabel>
                <Input
                  value={renameValue}
                  onChange={(e) => setRenameValue(e.target.value)}
                  maxLength={60}
                  autoFocus
                  {...inputProps}
                />
                <FormHelperText fontSize="xs">
                  For example “iPhone” or “Work laptop”.
                </FormHelperText>
              </FormControl>
            </ModalBody>
            <ModalFooter gap={2}>
              <Button size="sm" variant="ghost" onClick={() => setRenaming(null)}>
                Cancel
              </Button>
              <Button
                size="sm"
                type="submit"
                {...primaryButtonProps}
                isLoading={!!busy && busy.startsWith('rename:')}
                isDisabled={!renameValue.trim()}
              >
                Save
              </Button>
            </ModalFooter>
          </form>
        </ModalContent>
      </Modal>

      <AlertDialog
        isOpen={!!removing}
        leastDestructiveRef={cancelRef}
        onClose={() => setRemoving(null)}
        isCentered
      >
        <AlertDialogOverlay>
          <AlertDialogContent
            bg="page.bg-elevated"
            border="1px solid"
            borderColor="page.border"
            mx={4}
          >
            <AlertDialogHeader fontSize="md">Remove “{removing?.name}”?</AlertDialogHeader>
            <AlertDialogBody fontSize="sm">
              It can no longer sign in here. The passkey itself stays on the device until you delete
              it there (supported browsers are told to forget it).
              {data.policy.passkeyRequired && passkeyCount <= 1 ? (
                <Text mt={3} {...warnTextProps}>
                  It is your only passkey and “Require a passkey” is on — turn that off or add
                  another passkey first.
                </Text>
              ) : null}
            </AlertDialogBody>
            <AlertDialogFooter gap={2}>
              <Button
                ref={cancelRef}
                size="sm"
                {...outlineButtonProps}
                onClick={() => setRemoving(null)}
              >
                Cancel
              </Button>
              <Button
                size="sm"
                colorScheme="red"
                onClick={() => void remove()}
                isLoading={!!busy && busy.startsWith('remove:')}
              >
                Remove
              </Button>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialogOverlay>
      </AlertDialog>

      {codes ? (
        <RecoveryCodesDialog
          codes={codes}
          site={data.rp.id || 'this site'}
          onClose={() => setCodes(null)}
        />
      ) : null}
      {stepUpElement}
    </Box>
  )
}
