import { useEffect, useId, useMemo, useRef, useState } from 'react'
import {
  Alert,
  AlertDescription,
  AlertIcon,
  Box,
  Button,
  Checkbox,
  Code,
  Flex,
  Spinner,
  Text,
  VisuallyHidden,
  useToast,
} from '@chakra-ui/react'
import { AuthError, PasswordField } from '../AuthCard'
import { MONO, SectionLabel, primaryButtonProps } from '../shell/ui'
import { loginHref, readJsonObject } from '../shell/http'
import { NETWORK_ERROR } from '../shell/authMessages'
import {
  checkNewPassword,
  normalizePassword,
  PASSWORD_ISSUE_MESSAGES,
  passwordIssues,
  type PasswordStrength,
} from '../../../lib/adminAuth/passwordPolicy'
import { clearOfHeader } from '../../../lib/anchorOffset'
import { parseStepUpChallenge, wasStepUpCancelled } from './stepUpClient'
import { absoluteTime, relativeTime } from './securityFormat'
import { passwordRules, waitLabel, type PasswordRule as Rule } from './passwordRules'

/** The Password part of GET /api/admin/security (lib/adminAuth/password.ts PasswordOverview). */
export type PasswordInfo = {
  email: string
  siteHost: string | null
  changedAt: number | null
  minLength: number
  maxLength: number
  bootstrap: { envSet: boolean; matchesCurrent: boolean | null }
}

type Done = {
  at: number
  signedOutOthers: boolean
  revoked: number
  bootstrap: PasswordInfo['bootstrap']
}

const STRENGTH: Record<
  Exclude<PasswordStrength, 'none'>,
  { label: string; bars: number; color: string }
> = {
  'too-weak': { label: 'too weak', bars: 1, color: 'status.error' },
  fair: { label: 'fair', bars: 2, color: 'status.warning' },
  good: { label: 'good', bars: 3, color: 'accent.text' },
  strong: { label: 'strong', bars: 4, color: 'status.open' },
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

/**
 * Scroll margin for what this card focuses: the sticky site header, the
 * sticky admin title bar under it (52px and up) and some air — the global
 * default only clears the site header (styles/globals.css, WCAG 2.4.11).
 */
const CLEAR_OF_BARS = clearOfHeader('72px')

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

/**
 * Admin → Security → Password: change the admin password in place
 * (POST /api/admin/security/password, lib/adminAuth/password.ts).
 *
 * One form that password managers understand: a hidden username field with
 * the account address, then current-password / new-password /
 * new-password. Live checklist and a rough strength from the same rules the
 * server enforces (lib/adminAuth/passwordPolicy); errors are tied to their
 * fields (aria-describedby) and the first one gets focus; a polite status
 * reads the checklist out once typing pauses; the submit button never
 * disables itself silently. With "Require a passkey" on, the request goes
 * through the step-up flow (a passkey, or the password plus a recovery
 * code); otherwise the current password is the re-authentication.
 */
export default function PasswordCard({
  index,
  info,
  passkeyOnly,
  otherBrowsers,
  now,
  fetchWithStepUp,
  onChanged,
}: {
  index: number
  info: PasswordInfo
  passkeyOnly: boolean
  /** Other browsers signed in now (sessions list; legacy browsers are not counted). */
  otherBrowsers: number
  now: number
  fetchWithStepUp: (input: string, init?: RequestInit, reason?: string) => Promise<Response>
  onChanged: () => Promise<void> | void
}) {
  const toast = useToast()
  const id = useId()
  const rulesId = `${id}-rules`
  const strengthId = `${id}-strength`
  const signOutHelpId = `${id}-signout-help`
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [confirm, setConfirm] = useState('')
  const [signOutOthers, setSignOutOthers] = useState(true)
  // Field errors show from the first submit on, never on blur: an error that
  // appears as a field loses focus would push the button away between the
  // press and the release of a click (the live checklist guides until then).
  const [submitted, setSubmitted] = useState(false)
  const [currentServerError, setCurrentServerError] = useState('')
  const [nextServerError, setNextServerError] = useState('')
  const [formError, setFormError] = useState('')
  const [notice, setNotice] = useState('')
  const [throttledUntil, setThrottledUntil] = useState<number | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [done, setDone] = useState<Done | null>(null)
  const [announcement, setAnnouncement] = useState('')
  const currentRef = useRef<HTMLInputElement>(null)
  const nextRef = useRef<HTMLInputElement>(null)
  const confirmRef = useRef<HTMLInputElement>(null)
  const submitRef = useRef<HTMLButtonElement>(null)
  const doneRef = useRef<HTMLDivElement>(null)

  const check = useMemo(
    () => checkNewPassword(next, { email: info.email, siteHost: info.siteHost, current }),
    [next, current, info.email, info.siteHost]
  )
  const rules = passwordRules(check, info.minLength, info.maxLength)
  const metCount = rules.filter((r) => r.state === 'met').length
  const strength = check.strength === 'none' ? null : STRENGTH[check.strength]

  // Read the checklist out once typing pauses (not on every key).
  useEffect(() => {
    if (!next) {
      setAnnouncement('')
      return
    }
    const t = window.setTimeout(() => {
      setAnnouncement(
        `${metCount} of ${rules.length} password requirements met${strength ? `. Strength: ${strength.label}` : ''}.`
      )
    }, 1200)
    return () => window.clearTimeout(t)
  }, [next, metCount, rules.length, strength])

  useEffect(() => {
    if (done) doneRef.current?.focus()
  }, [done])

  const currentError =
    currentServerError || (submitted && !current ? 'Enter your current password.' : '')
  const firstIssue = passwordIssues(check)[0]
  const nextError =
    nextServerError ||
    (submitted && !next
      ? 'Enter a new password.'
      : submitted && next && firstIssue
        ? PASSWORD_ISSUE_MESSAGES[firstIssue]
        : '')
  const confirmError =
    submitted && confirm && normalizePassword(confirm) !== normalizePassword(next)
      ? 'The new passwords don’t match.'
      : submitted && !confirm
        ? 'Type the new password again.'
        : ''

  const reset = () => {
    setCurrent('')
    setNext('')
    setConfirm('')
    setSubmitted(false)
    setCurrentServerError('')
    setNextServerError('')
    setFormError('')
    setNotice('')
    // Back to the safe default for the next change.
    setSignOutOthers(true)
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (submitting) return
    setSubmitted(true)
    setFormError('')
    setNotice('')
    setCurrentServerError('')
    setNextServerError('')
    // Field problems first, in reading order.
    const nextOk = !!next && check.ok
    const confirmOk = !!confirm && normalizePassword(confirm) === normalizePassword(next)
    if (!current) return currentRef.current?.focus()
    if (!nextOk) return nextRef.current?.focus()
    if (!confirmOk) return confirmRef.current?.focus()
    if (throttledUntil && throttledUntil > Date.now()) {
      setFormError(
        `Too many attempts. Try again in ${waitLabel(throttledUntil, Date.now())} (at ${absoluteTime(throttledUntil)}).`
      )
      return
    }
    setSubmitting(true)
    setDone(null)
    // Where focus goes when the answer names no field (network trouble, 409, 429…).
    let focusSubmit = true
    const init: RequestInit = {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ currentPassword: current, newPassword: next, signOutOthers }),
    }
    const reason =
      'Changing the password needs a passkey (or your password and a recovery code) while “Require a passkey” is on.'
    try {
      let res = passkeyOnly
        ? await fetchWithStepUp('/api/admin/security/password', init, reason)
        : await fetch('/api/admin/security/password', init)
      let json = await readJsonObject(res)
      // The policy was turned on in another tab: confirm, then send once more.
      if (!passkeyOnly && parseStepUpChallenge(res.status, json)) {
        res = await fetchWithStepUp('/api/admin/security/password', init, reason)
        json = await readJsonObject(res)
      }
      if (wasStepUpCancelled(res)) {
        setNotice('Not changed — the confirmation was closed. Your entries are still here.')
        return
      }
      if (res.ok) {
        const result: Done = {
          at: typeof json.changedAt === 'number' ? json.changedAt : Date.now(),
          signedOutOthers: json.signedOutOthers === true,
          revoked: typeof json.revoked === 'number' ? json.revoked : 0,
          bootstrap:
            json.bootstrap && typeof json.bootstrap === 'object' ? json.bootstrap : info.bootstrap,
        }
        // Offer the new password to the browser's password manager (Chromium).
        storeCredential(info.email, next)
        reset()
        if (json.signedIn === false) {
          window.location.href = loginHref('/admin/security')
          return
        }
        toast({
          status: 'success',
          title: 'Password changed',
          description: othersLine(result),
        })
        // The confirmation takes focus (useEffect on `done`).
        focusSubmit = false
        setDone(result)
        setThrottledUntil(null)
        await onChanged()
        return
      }
      const code = typeof json.code === 'string' ? json.code : ''
      const message = typeof json.error === 'string' ? json.error : ''
      if (res.status === 401 && code !== 'CURRENT_PASSWORD_INCORRECT') {
        window.location.href = loginHref('/admin/security')
        return
      }
      if (code === 'CURRENT_PASSWORD_INCORRECT') {
        setCurrentServerError('That isn’t your current password.')
        focusSubmit = false
        currentRef.current?.focus()
        currentRef.current?.select()
        return
      }
      if (code === 'PASSWORD_POLICY') {
        setNextServerError(message || 'Choose a different password.')
        focusSubmit = false
        nextRef.current?.focus()
        return
      }
      if (res.status === 429) {
        const seconds =
          Number(json.retryAfterSeconds) || Number(res.headers.get('Retry-After')) || 60
        const until = Date.now() + seconds * 1000
        setThrottledUntil(until)
        setFormError(
          `Too many attempts. Try again in ${waitLabel(until, Date.now())} (at ${absoluteTime(until)}).`
        )
        return
      }
      setFormError(message || `The password was not changed (HTTP ${res.status}).`)
    } catch {
      setFormError(NETWORK_ERROR)
    } finally {
      setSubmitting(false)
      if (focusSubmit) submitRef.current?.focus()
    }
  }

  const bootstrapNote = bootstrapCopy(done?.bootstrap ?? info.bootstrap, !!done)

  return (
    <>
      <SectionLabel
        index={index}
        title="Password"
        id="security-password"
        hint={
          passkeyOnly
            ? 'With “Require a passkey” on, the password signs in only together with a recovery code. Changing it asks for a passkey first when you haven’t confirmed recently.'
            : 'Signs in to the admin and confirms dangerous actions. A long passphrase, or one a password manager creates, works best.'
        }
        action={
          info.changedAt ? (
            <Text fontFamily={MONO} fontSize="11px" color="page.fg-secondary" className="tnum">
              changed{' '}
              <time
                dateTime={new Date(info.changedAt).toISOString()}
                title={absoluteTime(info.changedAt)}
              >
                {relativeTime(info.changedAt, now)}
              </time>
            </Text>
          ) : null
        }
      />

      {done ? (
        <Alert
          ref={doneRef}
          // Polite, and focused: read once, not shouted (Chakra's default is role="alert").
          role="status"
          tabIndex={-1}
          status="success"
          variant="left-accent"
          borderRadius="md"
          bg="page.bg-elevated"
          mb={4}
          fontSize="sm"
          alignItems="flex-start"
          scrollMarginTop={CLEAR_OF_BARS}
          _focusVisible={{ outline: '2px solid var(--accent)', outlineOffset: '2px' }}
          data-testid="password-changed"
        >
          <AlertIcon mt={0.5} />
          <AlertDescription>
            <Text as="span" fontWeight={600}>
              Password changed.
            </Text>{' '}
            {othersLine(done)}
          </AlertDescription>
        </Alert>
      ) : null}

      {bootstrapNote ? (
        <Alert
          role="note"
          status={bootstrapNote.tone}
          variant="left-accent"
          borderRadius="md"
          bg="page.bg-elevated"
          mb={4}
          fontSize="sm"
          alignItems="flex-start"
        >
          <AlertIcon mt={0.5} />
          <AlertDescription>{bootstrapNote.body}</AlertDescription>
        </Alert>
      ) : null}

      <Box
        border="1px solid"
        borderColor="page.border"
        borderRadius="lg"
        px={{ base: 3, md: 5 }}
        py={{ base: 4, md: 5 }}
        // Fields focused after an error land below the site header AND the admin title bar.
        sx={{ '& :is(input, button, [tabindex])': { scrollMarginTop: CLEAR_OF_BARS } }}
      >
        <AuthError>{formError}</AuthError>
        <form onSubmit={(e) => void submit(e)} noValidate aria-labelledby="security-password">
          {/* For password managers: which account this password belongs to. */}
          <input
            type="email"
            name="username"
            autoComplete="username"
            value={info.email}
            readOnly
            hidden
          />
          <Box
            display="grid"
            gridTemplateColumns={{ base: 'minmax(0, 1fr)', lg: 'minmax(0, 420px) minmax(0, 1fr)' }}
            gridTemplateAreas={{
              base: '"current" "next" "rules" "confirm" "options" "actions"',
              lg: '"current rules" "next rules" "confirm rules" "options rules" "actions rules"',
            }}
            columnGap={10}
            rowGap={4}
            alignItems="start"
          >
            <Box gridArea="current">
              <PasswordField
                label="Current password"
                name="current-password"
                autoComplete="current-password"
                inputRef={currentRef}
                value={current}
                onChange={(e) => {
                  setCurrent(e.target.value)
                  setCurrentServerError('')
                }}
                error={currentError}
                isRequired
              />
            </Box>
            <Box gridArea="next">
              <PasswordField
                label="New password"
                name="new-password"
                autoComplete="new-password"
                inputRef={nextRef}
                value={next}
                onChange={(e) => {
                  setNext(e.target.value)
                  setNextServerError('')
                }}
                error={nextError}
                aria-describedby={`${rulesId} ${strengthId}`}
                isRequired
                // Safari's generator and some managers read the rules from here.
                {...({
                  passwordrules: `minlength: ${info.minLength}; maxlength: ${info.maxLength};`,
                } as Record<string, string>)}
              />
            </Box>
            <Box gridArea="rules" pt={{ lg: 6 }}>
              <Text id={`${rulesId}-title`} fontSize="12px" fontWeight={500} mb={1.5}>
                Requirements
              </Text>
              <Box
                as="ul"
                id={rulesId}
                aria-labelledby={`${rulesId}-title`}
                listStyleType="none"
                display="grid"
                rowGap={1}
              >
                {rules.map((r) => (
                  <Flex
                    as="li"
                    key={r.key}
                    align="center"
                    gap={2}
                    fontSize="13px"
                    data-state={r.state}
                  >
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
                id={strengthId}
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
                      bg={strength && n <= strength.bars ? strength.color : 'page.border-strong'}
                    />
                  ))}
                </Flex>
                <Text as="span">
                  Strength:{' '}
                  <Box as="span" fontWeight={600} color={strength ? strength.color : undefined}>
                    {strength ? strength.label : '—'}
                  </Box>
                </Text>
              </Flex>
              <Text fontSize="12px" color="page.fg-secondary" mt={2} maxW="46ch">
                Any characters work, spaces and emoji included. The strength is a rough estimate.
              </Text>
            </Box>
            <Box gridArea="confirm">
              <PasswordField
                label="Confirm new password"
                name="confirm-password"
                autoComplete="new-password"
                inputRef={confirmRef}
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                error={confirmError}
                isRequired
              />
            </Box>
            <Box gridArea="options">
              <Checkbox
                isChecked={signOutOthers}
                onChange={(e) => setSignOutOthers(e.target.checked)}
                colorScheme="purple"
                aria-describedby={signOutHelpId}
              >
                <Text as="span" fontSize="sm">
                  Sign out other browsers
                </Text>
              </Checkbox>
              <Text id={signOutHelpId} mt={1} ml={6} fontSize="12px" color="page.fg-secondary">
                {otherBrowsers > 0
                  ? `Ends the session of the ${otherBrowsers === 1 ? 'other browser' : `${otherBrowsers} other browsers`} signed in now. This browser stays signed in.`
                  : 'Ends every other session, should one exist. This browser stays signed in.'}
              </Text>
            </Box>
            <Flex gridArea="actions" align="center" gap={3} flexWrap="wrap">
              {/* Never disabled: while it works it says so (and keeps focus). */}
              <Button
                ref={submitRef}
                type="submit"
                size="sm"
                {...primaryButtonProps}
                aria-busy={submitting || undefined}
                leftIcon={submitting ? <Spinner size="xs" /> : undefined}
              >
                {submitting ? 'Changing…' : 'Change password'}
              </Button>
              {notice ? (
                <Text fontSize="12px" color="page.fg-secondary">
                  {notice}
                </Text>
              ) : null}
            </Flex>
          </Box>
        </form>
      </Box>
      <VisuallyHidden role="status" aria-live="polite">
        {announcement}
      </VisuallyHidden>
    </>
  )
}

/** What happened to the browsers, in one sentence (this one always stays signed in). */
function othersLine(done: Done): string {
  if (!done.signedOutOthers) return 'Every signed-in browser stays signed in, this one included.'
  if (done.revoked === 0) return 'No other browser was signed in; this one stays signed in.'
  return `Signed out ${done.revoked === 1 ? '1 other browser' : `${done.revoked} other browsers`}; this one stays signed in.`
}

/**
 * What to say about ADMIN_PASS (read only while data/admin.json is missing):
 * a warning while it still equals the live password, advice once it differs.
 */
function bootstrapCopy(
  b: PasswordInfo['bootstrap'],
  justChanged: boolean
): { tone: 'warning' | 'info'; body: React.ReactNode } | null {
  if (!b.envSet) return null
  const env = <Code fontSize="xs">ADMIN_PASS</Code>
  const file = <Code fontSize="xs">data/admin.json</Code>
  if (b.matchesCurrent === true) {
    return {
      tone: 'warning',
      body: (
        <>
          {env} in the server’s environment is still this password. It is only read when {file} is
          missing (a new server) — change the password here, then remove {env} from the server’s{' '}
          <Code fontSize="xs">.env</Code>.
        </>
      ),
    }
  }
  return {
    tone: 'info',
    body: (
      <>
        {justChanged ? 'Next: ' : ''}remove {env} from the server’s <Code fontSize="xs">.env</Code>
        {b.matchesCurrent === false ? ' — it no longer matches this password' : ''}. It is only read
        when {file} is missing, and would set up a new server with that value; keep it only if you
        update it to the new password.
      </>
    ),
  }
}

/** Hand the new password to the browser's password manager, where the Credential Management API exists (Chromium). */
function storeCredential(email: string, password: string): void {
  try {
    const PC = (
      window as unknown as {
        PasswordCredential?: new (init: { id: string; password: string }) => Credential
      }
    ).PasswordCredential
    if (!PC || !window.isSecureContext || !email || !navigator.credentials?.store) return
    void navigator.credentials.store(new PC({ id: email, password })).catch(() => undefined)
  } catch {
    // Optional: the browser asks on its own otherwise.
  }
}
