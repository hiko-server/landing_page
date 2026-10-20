import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Box,
  Button,
  Flex,
  Heading,
  IconButton,
  Input,
  Link,
  Textarea,
  Text,
  FormControl,
  FormErrorMessage,
  FormHelperText,
  FormLabel,
  HStack,
  VStack,
  Divider,
  Select,
  chakra,
} from '@chakra-ui/react'
import { keyframes } from '@emotion/react'
import { GitHubIcon, GitLabIcon, LinkedInIcon, WhatsAppIcon } from '../Icons/brand'
import { CheckIcon } from '../Icons/ui/theme'
import { ChevronRightIcon } from '../Icons/ui/content'
import { m, useReducedMotion } from 'framer-motion'

import { safeHref } from '../../lib/cvFormat'
import {
  INQUIRY_LIMITS,
  INQUIRY_TIMELINES,
  INTENT_FIELDS,
  inquiryRows,
  intentOf,
  isInquiryTimeline,
  reasonsOf,
  type InquiryIntent,
} from '../../lib/inquiry'
import { fillUi } from '../../lib/uiStrings'
import { CONTACT_EN, type ContactStrings } from '../../lib/uiStrings/contact-en'
import CopyButton from '../General-UI/CopyButton'
import EmailText from '../Common/EmailText'
import QrSvg from '../Common/QrSvg'
import {
  EMPTY_INQUIRY,
  MESSAGE_MAX,
  inquiryPayload,
  isContactValid,
  privacyNoticeText,
  shouldRefreshChallengeOnRestore,
  submitHint,
  validateContact,
  visibleErrors,
  type ContactField,
  type ContactValues,
} from '../Common/contactForm'
import { CONTACT_DRAFT_KEY, CONTACT_FORM_ID, CONTACT_PREFILL_EVENT, prefillMessage } from '../../lib/contactPrefill'
import { focusUntilItSticks } from '../../lib/focusAfterDialog'
import { clearOfHeader } from '../../lib/anchorOffset'

/** Nonces live 30 min server-side; refresh a little before that. */
const NONCE_MAX_AGE_MS = 25 * 60 * 1000
const DRAFT_KEY = CONTACT_DRAFT_KEY

type HomeData = {
  hero?: { phone?: string; email?: string; avatarUrl?: string; brand?: string }
  socials?: {
    github?: string
    gitlab?: string
    linkedin?: string
    whatsapp?: string
  }
  /** Editable contact-panel copy + reasons dropdown. All optional —
   *  every field falls back to a built-in default when blank. */
  contact?: {
    heading?: string
    blurb?: string
    eyebrow?: string
    reasons?: string[]
    /** Reason → inquiry kind (lib/inquiry.ts). */
    intents?: Record<string, string>
  }
  /** Public availability (the home page passes the whole public home view). */
  availability?: Availability | null
}

type Availability = { status?: string; bookingUrl?: string; workStatus?: string; workStatusLang?: string }

/**
 * A reason the form offers: its label in the page's language, its kind of
 * inquiry and, when the label is the owner's English one on a Chinese page
 * (no Chinese name written), its language.
 */
export type ReasonOption = { label: string; intent: InquiryIntent; lang?: string }

const MotionBox = m(Box)

// Built-in defaults (lib/uiStrings/contact `panel`) are used when the
// contact block is missing or a field is blank. The built-in reasons live in
// lib/inquiry (DEFAULT_REASONS) with their inquiry kinds.

const monoFont = 'var(--font-geist-mono), ui-monospace, monospace'

const drawCircle = keyframes`from { stroke-dashoffset: 151; } to { stroke-dashoffset: 0; }`
const drawTick = keyframes`from { stroke-dashoffset: 36; } to { stroke-dashoffset: 0; }`

const labelProps = {
  fontFamily: monoFont,
  fontSize: '11px',
  letterSpacing: '0.04em',
  color: 'page.fg-secondary',
  fontWeight: 400,
  mb: 1.5,
} as const

const inputProps = {
  borderColor: 'page.border-strong',
  _hover: { borderColor: 'page.fg-secondary' },
  _focusVisible: { borderColor: 'var(--accent)', boxShadow: '0 0 0 1px var(--accent)' },
  _invalid: { borderColor: 'red.500', boxShadow: '0 0 0 1px var(--chakra-colors-red-500)' },
} as const

/** The confirmation's follow-up links (CV, contact card, booking). */
const nextStepProps = {
  variant: 'outline',
  size: 'sm',
  h: '36px',
  borderColor: 'page.border-strong',
  color: 'page.fg',
  fontFamily: monoFont,
  fontSize: '12px',
  fontWeight: 400,
  _hover: { borderColor: 'var(--accent)', color: 'accent.text', textDecoration: 'none' },
  _focusVisible: { outline: '2px solid var(--accent)', outlineOffset: '3px' },
} as const

type Sent = { name: string; email: string; subject: string; intent: InquiryIntent }

/**
 * A dictionary sentence with React nodes in its `{name}` places (the
 * confirmation's subject and address, the human check's numbers), so each
 * language keeps its own word order.
 */
function fillNodes(template: string, values: Readonly<Record<string, React.ReactNode>>): React.ReactNode[] {
  return template.split(/(\{\w+\})/).map((part, i) => {
    const m = /^\{(\w+)\}$/.exec(part)
    return <React.Fragment key={i}>{m && m[1] in values ? values[m[1]] : part}</React.Fragment>
  })
}

/** Owner's https booking link, '' otherwise (never another scheme). */
function bookingHref(url: unknown): string {
  const href = safeHref(url)
  return /^https:\/\//i.test(href) ? href : ''
}

/**
 * Rows of the form that sit side by side once the form itself is at least
 * 30rem wide (a container query on the <form>, so the layout follows the
 * panel's width — not the viewport's — and never overflows on tablets).
 */
const responsiveRow = {
  flexDirection: 'column',
  '@container (min-width: 30rem)': { flexDirection: 'row' },
} as const

/** The actions: stacked full-width below 30rem, one wrapping row above. */
const actionRow = {
  flexDirection: 'column',
  alignItems: 'stretch',
  '@container (min-width: 30rem)': { flexDirection: 'row', alignItems: 'center' },
} as const

/**
 * Contact panel: optional "reach me" info card + the message form.
 *
 *   - Inline validation (shown once a field is left, or after a send
 *     attempt); each error is announced politely and linked to its field.
 *   - "Send" stays disabled until the form is valid, with a hint saying
 *     exactly what is still missing.
 *   - On success the form is replaced in place by a confirmation (animated
 *     check, what was sent, "Send another"), and focus moves to it.
 *   - API: GET /api/contact/nonce, then POST /api/contact with { name,
 *     email, subject, message, nonce, mathAnswer, hp } plus the structured
 *     inquiry { reason, intent, company?, roleUrl?, timeline? }.
 *   - Progressive disclosure: the chosen reason's kind (lib/inquiry.ts —
 *     role / freelance / collab / other) reveals a few optional fields
 *     (company, a link, a timeline), announced politely to screen readers.
 *   - Human check: signed nonce (server-verified, ≥ 2s old) + visible sum +
 *     hidden honeypot. Drafts autosave locally and clear on send.
 *   - A privacy notice under the actions says what is kept, why and for how
 *     long (`retentionDays`, else the value the nonce endpoint reports).
 *   - E-mail / phone render through EmailText (Cloudflare-safe, no hydration
 *     mismatch) with morphing copy buttons; /contact adds "Save contact
 *     (.vcf)" and a QR code for the vCard (`vcard`). The confirmation offers
 *     the CV, the contact card and the owner's booking link.
 *   - Every word is the page's (`t`, lib/uiStrings/contact): /zh/contact
 *     passes the Chinese ones and its reasons (`reasonOptions`: the owner's
 *     Chinese names, the kinds of the English list), and a refusal from the
 *     API is told by its `code` (F3).
 */
export default function ContactPro({
  home,
  formOnly,
  headingAs = 'h2',
  hideBlurb,
  vcard,
  availability: availabilityProp,
  retentionDays: retentionProp,
  cvHref = '/cv',
  t = CONTACT_EN,
  lang = 'en',
  reasonOptions,
}: {
  home?: HomeData
  formOnly?: boolean
  /** Heading level of the info panel (the page title is an h1 above it on /contact). */
  headingAs?: 'h1' | 'h2'
  /** Leave the blurb out of the info panel (when the page header already shows it). */
  hideBlurb?: boolean
  /** "Save contact (.vcf)" link and, from md up, a QR code (inline SVG, lib/qr.ts) of the same URL. */
  vcard?: { href: string; qrSvg?: string | null }
  /** Public availability (booking link, right-to-work line); defaults to `home.availability`. */
  availability?: Availability | null
  /** Contact-message retention in days (0 = kept until deleted); omitted = learnt from the nonce endpoint. */
  retentionDays?: number
  /** Where "Read my CV" points after sending. */
  cvHref?: string
  /** The page's words (lib/uiStrings/contact; English by default) and its language. */
  t?: ContactStrings
  lang?: string
  /** The reasons in the page's language with their kinds (default: the home document's, in English). */
  reasonOptions?: readonly ReasonOption[]
}) {
  const reduce = useReducedMotion()
  const englishPage = lang === 'en'

  // Admin copy wins when non-blank; blank / missing entries use the defaults.
  const options = useMemo<readonly ReasonOption[]>(
    () => reasonOptions ?? reasonsOf(home?.contact).map((r) => ({ label: r, intent: intentOf(r, home?.contact) })),
    [reasonOptions, home?.contact],
  )
  const reasons = useMemo(() => options.map((o) => o.label), [options])
  // The marker is an icon now; an owner eyebrow typed with the old ▸ glyph keeps one marker.
  const eyebrowText = (home?.contact?.eyebrow ?? '').trim().replace(/^▸\s*/, '') || t.panel.eyebrow
  const headingText = (home?.contact?.heading ?? '').trim() || home?.hero?.brand || t.panel.heading
  const blurbText = (home?.contact?.blurb ?? '').trim() || t.panel.blurb
  const email = (home?.hero?.email || '').trim()
  const phone = (home?.hero?.phone || '').trim()
  const mailtoBase = email ? safeHref(`mailto:${email}`) : ''
  const availability = availabilityProp === undefined ? home?.availability : availabilityProp
  const booking = availability?.status ? bookingHref(availability.bookingUrl) : ''
  const workStatus = availability?.status && typeof availability.workStatus === 'string' ? availability.workStatus.trim() : ''
  // On a Chinese page the line is the owner's Chinese one, else their English one (marked so).
  const workStatusLang = englishPage ? undefined : availability?.workStatusLang
  const vcardHref = vcard?.href || '/api/vcard'

  const [values, setValues] = useState<ContactValues>({
    name: '',
    email: '',
    reason: reasons[0],
    subject: '',
    message: '',
    mathAnswer: '',
    ...EMPTY_INQUIRY,
  })
  const set = (k: keyof ContactValues) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setValues((v) => ({ ...v, [k]: e.target.value }))
  const intent: InquiryIntent = options.find((o) => o.label === values.reason)?.intent ?? 'other'
  const reasonLang = options.find((o) => o.label === values.reason)?.lang
  // The structured fields appear once the visitor picks a reason (or a draft
  // brings one back), so the form starts short; the kind is sent either way.
  const [reasonChosen, setReasonChosen] = useState(false)
  const shownIntent: InquiryIntent = reasonChosen ? intent : 'other'
  const disclosed = INTENT_FIELDS[shownIntent]
  const copy = shownIntent === 'other' ? null : t.fields[shownIntent]
  const payloadOf = (v: ContactValues) => ({ ...inquiryPayload(v, shownIntent), intent })

  // Retention period for the privacy notice: the page's value, else what the nonce endpoint reports.
  const [nonceRetention, setNonceRetention] = useState<number | null>(null)
  const retentionDays = typeof retentionProp === 'number' ? retentionProp : nonceRetention

  // Announce newly disclosed fields (not on the first render).
  const [disclosureNote, setDisclosureNote] = useState('')
  const lastIntent = useRef(shownIntent)
  useEffect(() => {
    if (lastIntent.current === shownIntent) return
    lastIntent.current = shownIntent
    setDisclosureNote(copy ? fillUi(t.disclosure.added, { fields: disclosed.map((f) => copy[f].label).join(t.hint.sep) }) : t.disclosure.none)
  }, [shownIntent, copy, disclosed, t])

  const [touched, setTouched] = useState<Partial<Record<ContactField, boolean>>>({})
  const touch = (k: ContactField) => () => setTouched((t) => (t[k] ? t : { ...t, [k]: true }))
  const [attempted, setAttempted] = useState(false)
  const [sending, setSending] = useState(false)
  const [serverError, setServerError] = useState<string | null>(null)
  const [sent, setSent] = useState<Sent | null>(null)
  const [honeypot, setHoneypot] = useState('')

  // The sum comes from the server together with the signed nonce, which
  // carries an HMAC of the answer (verified by /api/contact). It is loaded
  // when the form scrolls into view, so SSR and hydration markup match.
  const [mathPair, setMathPair] = useState<{ a: number; b: number } | null>(null)
  const expectedMath = mathPair ? mathPair.a + mathPair.b : null

  const errors = validateContact(values, expectedMath, shownIntent, t)
  const valid = isContactValid(errors)
  const shown = visibleErrors(errors, touched, attempted)
  const hint = submitHint(errors, t)

  const nameRef = useRef<HTMLInputElement | null>(null)
  const successRef = useRef<HTMLHeadingElement | null>(null)

  // Signed nonce (+ its sum): fetched when the form scrolls into view or is
  // focused, and refreshed near its 30-minute expiry so a slow message never fails.
  const [nonce, setNonce] = useState<string | null>(null)
  const [nonceErr, setNonceErr] = useState<string | null>(null)
  const nonceAtRef = useRef(0)
  const fetchNonce = useCallback(async (): Promise<string | null> => {
    try {
      const r = await fetch('/api/contact/nonce', { cache: 'no-store' })
      if (!r.ok) throw new Error(String(r.status))
      const d = await r.json()
      const c = d?.challenge
      if (!c || !Number.isInteger(c.a) || !Number.isInteger(c.b)) throw new Error('no challenge')
      nonceAtRef.current = Date.now()
      setNonce(d.token)
      setMathPair({ a: c.a, b: c.b })
      if (Number.isInteger(d?.retentionDays) && d.retentionDays >= 0) setNonceRetention(d.retentionDays)
      setNonceErr(null)
      return d.token as string
    } catch {
      nonceAtRef.current = 0
      setNonceErr(t.errors.nonce)
      return null
    }
  }, [t])
  const ensureNonce = useCallback(async (): Promise<string | null> => {
    if (nonce && Date.now() - nonceAtRef.current < NONCE_MAX_AGE_MS) return nonce
    return fetchNonce()
  }, [nonce, fetchNonce])
  const warmNonce = useCallback(() => {
    if (!nonce && !nonceAtRef.current) {
      nonceAtRef.current = 1 // in flight
      fetchNonce()
    }
  }, [nonce, fetchNonce])

  /**
   * WCAG 2.4.11: a tall control (the message box) that receives focus while
   * partly under the sticky header is "in view" for the browser, which then
   * does not scroll. Bring it clear — scrollIntoView honours the controls'
   * scroll-margin-top (styles/globals.css), so it lands below the header.
   */
  const onFormFocus = useCallback(
    (e: React.FocusEvent<HTMLFormElement>) => {
      warmNonce()
      const el = e.target as HTMLElement
      const header = document.querySelector('header')
      if (!header || typeof el.scrollIntoView !== 'function') return
      if (el.getBoundingClientRect().top < header.getBoundingClientRect().bottom) el.scrollIntoView({ block: 'nearest' })
    },
    [warmNonce],
  )

  // Load the challenge once the form is on screen (not on every page view
  // that never reaches the form).
  const formRef = useRef<HTMLFormElement | null>(null)
  useEffect(() => {
    if (sent || mathPair) return
    const el = formRef.current
    if (!el || typeof IntersectionObserver === 'undefined') {
      warmNonce()
      return
    }
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          warmNonce()
          io.disconnect()
        }
      },
      { rootMargin: '200px' },
    )
    io.observe(el)
    return () => io.disconnect()
  }, [sent, mathPair, warmNonce])

  /** Replace the challenge (wrong answer / expired nonce) and clear the stale answer. */
  const refreshChallenge = useCallback(async () => {
    setNonce(null)
    nonceAtRef.current = 0
    setValues((v) => ({ ...v, mathAnswer: '' }))
    return fetchNonce()
  }, [fetchNonce])

  // Back from the back/forward cache: the page (and its challenge) is exactly
  // as it was left, possibly long ago. A challenge that may expire before the
  // visitor sends is replaced up front, instead of changing under them at submit.
  const sentRef = useRef(false)
  sentRef.current = !!sent
  useEffect(() => {
    const onShow = (e: PageTransitionEvent) => {
      if (shouldRefreshChallengeOnRestore({ persisted: e.persisted, fetchedAt: nonceAtRef.current, now: Date.now(), sent: sentRef.current })) {
        void refreshChallenge()
      }
    }
    window.addEventListener('pageshow', onShow)
    return () => window.removeEventListener('pageshow', onShow)
  }, [refreshChallenge])

  // Draft autosave (everything but the human-check answer), in this browser only.
  useEffect(() => {
    if (sent) return
    const id = setTimeout(() => {
      const { name, email: em, reason, subject, message, company, roleUrl, timeline } = values
      try {
        localStorage.setItem(DRAFT_KEY, JSON.stringify({ name, email: em, reason, subject, message, company, roleUrl, timeline }))
      } catch {
        /* storage unavailable — drafts are a convenience only */
      }
    }, 600)
    return () => clearTimeout(id)
  }, [values, sent])

  useEffect(() => {
    try {
      const raw = localStorage.getItem(DRAFT_KEY)
      if (!raw) return
      const d = JSON.parse(raw)
      const str = (x: unknown) => (typeof x === 'string' ? x : '')
      setValues((v) => ({
        ...v,
        name: str(d.name),
        email: str(d.email),
        reason: reasons.includes(str(d.reason)) ? str(d.reason) : reasons[0],
        subject: str(d.subject),
        message: str(d.message).slice(0, MESSAGE_MAX),
        company: str(d.company).slice(0, INQUIRY_LIMITS.companyMax),
        roleUrl: str(d.roleUrl).slice(0, INQUIRY_LIMITS.roleUrlMax),
        timeline: isInquiryTimeline(d.timeline) ? d.timeline : '',
      }))
      // A draft that picked a reason (or filled its fields) shows them again.
      if ((reasons.includes(str(d.reason)) && str(d.reason) !== reasons[0]) || str(d.company) || str(d.roleUrl) || isInquiryTimeline(d.timeline)) {
        setReasonChosen(true)
      }
    } catch {
      /* ignore malformed draft */
    }
    // Restoring a draft runs once, on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // "Ask Lucian directly" (lib/contactPrefill): a question "Ask" could not
  // answer fills an empty message while the form is on the page. The form
  // takes the hand-off (preventDefault: the palette leaves the scrolling to
  // it), focuses the message once the palette's focus trap has let go
  // (lib/focusAfterDialog — focused at once, the trap pulled it back and
  // focus was lost to <body>), brings it into view and says what happened.
  const messageRef = useRef<HTMLTextAreaElement | null>(null)
  const messageValueRef = useRef(values.message)
  messageValueRef.current = values.message
  const [prefillNote, setPrefillNote] = useState('')
  useEffect(() => {
    const onPrefill = (e: Event) => {
      const message = prefillMessage((e as CustomEvent<{ message?: unknown }>).detail?.message)
      if (!message || !messageRef.current) return
      e.preventDefault()
      const kept = !!messageValueRef.current.trim()
      if (!kept) setValues((v) => (v.message.trim() ? v : { ...v, message: message.slice(0, MESSAGE_MAX) }))
      setPrefillNote(kept ? t.prefill.kept : t.prefill.added)
      const behavior: ScrollBehavior = window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth'
      focusUntilItSticks(messageRef.current, {
        preventScroll: true,
        onSettled: (stuck) => {
          const el = messageRef.current
          if (!el) return
          // Centred, clear of the sticky header (the controls' scroll margins, styles/globals.css).
          el.scrollIntoView({ block: 'center', behavior })
          // The caret after the question, ready to add to it.
          if (stuck && !kept) el.setSelectionRange(el.value.length, el.value.length)
        },
      })
    }
    window.addEventListener(CONTACT_PREFILL_EVENT, onPrefill)
    return () => window.removeEventListener(CONTACT_PREFILL_EVENT, onPrefill)
  }, [t])

  const resetForm = () => {
    try {
      localStorage.removeItem(DRAFT_KEY)
    } catch {
      /* ignore */
    }
    setValues({ name: '', email: '', reason: reasons[0], subject: '', message: '', mathAnswer: '', ...EMPTY_INQUIRY })
    setReasonChosen(false)
    setTouched({})
    setAttempted(false)
    setServerError(null)
    setHoneypot('')
  }

  const sendAnother = () => {
    setSent(null)
    // The used nonce is gone; the form's observer loads a fresh challenge.
    setMathPair(null)
    // Focus returns to the first field once the form is back in the DOM.
    requestAnimationFrame(() => nameRef.current?.focus())
  }

  useEffect(() => {
    if (sent) successRef.current?.focus()
  }, [sent])

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setAttempted(true)
    if (!valid || sending) return
    setSending(true)
    setServerError(null)
    try {
      const previous = nonce
      const token = await ensureNonce()
      if (!token) return
      // An expired nonce was replaced at submit time: its sum changed too.
      if (previous && token !== previous) {
        setValues((v) => ({ ...v, mathAnswer: '' }))
        setServerError(t.errors.refreshed)
        return
      }
      // The server requires ≥ 2s between issuing the nonce and submitting.
      const age = Date.now() - nonceAtRef.current
      if (age < 2100) await new Promise((r) => setTimeout(r, 2100 - age))
      const subject = values.subject.trim() || values.reason
      const res = await fetch('/api/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: values.name.trim(),
          email: values.email.trim(),
          subject,
          message: values.message,
          ...payloadOf(values),
          nonce: token,
          mathAnswer: Number(values.mathAnswer),
          hp: honeypot, // expected to be ''
        }),
      })
      if (res.ok) {
        setSent({ name: values.name.trim(), email: values.email.trim(), subject, intent })
        resetForm()
        // A nonce is single-purpose; take a fresh one for any follow-up.
        setNonce(null)
        nonceAtRef.current = 0
      } else {
        const d = await res.json().catch(() => ({}))
        // Each challenge allows one attempt: take a fresh one after a miss.
        if (d?.code === 'BAD_CHALLENGE') await refreshChallenge()
        if (d?.field === 'roleUrl') setTouched((t) => ({ ...t, roleUrl: true }))
        // English pages show the server's own words; another language says it by the answer's code.
        const own = typeof d?.error === 'string' && d.error ? d.error : ''
        const coded = typeof d?.code === 'string' ? t.errors.codes[d.code] : undefined
        setServerError(englishPage ? own || t.errors.sendFailed : coded || t.errors.sendFailed)
      }
    } catch {
      setServerError(t.errors.network)
    } finally {
      setSending(false)
    }
  }

  const contactRows = [
    email ? { label: t.panel.email, value: email, copyLabel: t.panel.copyEmail, copied: t.panel.emailCopied } : null,
    phone ? { label: t.panel.tel, value: phone, copyLabel: t.panel.copyPhone, copied: t.panel.phoneCopied } : null,
  ].filter((r): r is { label: string; value: string; copyLabel: string; copied: string } => r !== null)

  const socials = [
    { name: 'GitHub', icon: <GitHubIcon />, href: safeHref(home?.socials?.github) },
    { name: 'GitLab', icon: <GitLabIcon />, href: safeHref(home?.socials?.gitlab) },
    { name: 'LinkedIn', icon: <LinkedInIcon />, href: safeHref(home?.socials?.linkedin) },
    { name: 'WhatsApp', icon: <WhatsAppIcon />, href: safeHref(home?.socials?.whatsapp) },
  ].filter((s) => s.href)

  const chars = values.message.length
  const hintId = 'contact-submit-hint'
  const panelMotion = (delay: number) => ({
    initial: reduce ? false : { opacity: 0, y: 12 },
    animate: { opacity: 1, y: 0 },
    transition: { duration: 0.4, delay, ease: [0.22, 1, 0.36, 1] },
  })

  return (
    <Flex direction={{ base: 'column', md: 'row' }} gap={6} w="100%" maxW="var(--container-content)">
      {!formOnly && (
        <MotionBox
          flex={{ base: 'none', md: '0 0 340px' }}
          minW={0}
          borderWidth="1px"
          borderColor="page.border"
          borderRadius="lg"
          p={{ base: 5, md: 6 }}
          {...(panelMotion(0) as any)}
        >
          <VStack align="stretch" spacing={5}>
            <Box>
              <Text display="flex" alignItems="center" gap={1.5} fontFamily={monoFont} fontSize="11px" letterSpacing="0.16em" textTransform="uppercase" color="page.fg-secondary" mb={2}>
                <ChevronRightIcon size="xs" />
                {eyebrowText}
              </Text>
              <Heading as={headingAs} size="md" fontWeight={500} letterSpacing="-0.015em" color="page.fg">
                {headingText}
              </Heading>
              {hideBlurb ? null : (
                <Text fontSize="sm" color="page.fg-secondary" mt={1}>
                  {blurbText}
                </Text>
              )}
            </Box>

            {contactRows.length > 0 && (
              <>
                <Divider borderColor="page.border" />
                <Box>
                  <VStack as="ul" listStyleType="none" align="stretch" spacing={2}>
                    {contactRows.map((it) => (
                      <Flex as="li" key={it.label} justify="space-between" align="center" gap={2}>
                        <HStack spacing={3} minW={0}>
                          <Text as="span" fontFamily={monoFont} fontSize="11px" color="page.fg-secondary" letterSpacing="0.04em" w="44px" flexShrink={0}>
                            {it.label}
                          </Text>
                          <Text as="span" fontSize="14px" color="page.fg" isTruncated>
                            <EmailText value={it.value} />
                          </Text>
                        </HStack>
                        <CopyButton value={it.value} label={it.copyLabel} srLabel={it.copied} />
                      </Flex>
                    ))}
                  </VStack>
                  {vcard ? (
                    <Link
                      href={vcard.href}
                      download="Li-Yanpei.vcf"
                      display="inline-flex"
                      alignItems="center"
                      gap={1.5}
                      mt={3}
                      py={1}
                      fontFamily={monoFont}
                      fontSize="12px"
                      color="accent.text"
                      textDecoration="underline"
                      textUnderlineOffset="3px"
                      textDecorationColor="var(--accent-ring)"
                      _hover={{ textDecorationColor: 'currentColor' }}
                    >
                      {t.panel.saveVcf}
                    </Link>
                  ) : null}
                </Box>
              </>
            )}

            {vcard?.qrSvg ? (
              <Flex display={{ base: 'none', md: 'flex' }} align="center" gap={4}>
                <Box
                  role="img"
                  aria-label={t.panel.qrLabel}
                  w="96px"
                  h="96px"
                  p="8px"
                  flexShrink={0}
                  borderRadius="md"
                  border="1px solid"
                  borderColor="page.border"
                  bg="white"
                  color="#0a0a0a"
                  sx={{ '& svg': { display: 'block', width: '100%', height: '100%' } }}
                >
                  <QrSvg svg={vcard.qrSvg} />
                </Box>
                <Text fontFamily={monoFont} fontSize="11px" letterSpacing="0.04em" color="page.fg-secondary">
                  {t.panel.scanToSave}
                </Text>
              </Flex>
            ) : null}

            {socials.length > 0 && (
              <>
                <Divider borderColor="page.border" />
                <Box>
                  <Text display="flex" alignItems="center" gap={1.5} fontFamily={monoFont} fontSize="11px" letterSpacing="0.16em" textTransform="uppercase" color="page.fg-secondary" mb={3}>
                    <ChevronRightIcon size="xs" />
                    {t.panel.elsewhere}
                  </Text>
                  <HStack as="ul" listStyleType="none" spacing={2}>
                    {socials.map((s) => (
                      <li key={s.name}>
                        <IconButton
                          as="a"
                          href={s.href}
                          target="_blank"
                          rel="noopener noreferrer"
                          aria-label={`${s.name}${t.panel.newTab}`}
                          icon={s.icon}
                          variant="outline"
                          size="md"
                          borderColor="page.border-strong"
                          color="page.fg-secondary"
                          _hover={{ borderColor: 'page.fg-secondary', color: 'page.fg' }}
                        />
                      </li>
                    ))}
                  </HStack>
                </Box>
              </>
            )}
          </VStack>
        </MotionBox>
      )}

      {/* Form panel */}
      <MotionBox flex="1" minW={0} borderWidth="1px" borderColor="page.border" borderRadius="lg" p={{ base: 5, md: 6 }} {...(panelMotion(0.05) as any)}>
        {sent ? (
          <Flex direction="column" align="flex-start" gap={4} py={{ base: 4, md: 8 }}>
            <Box
              as="svg"
              aria-hidden
              viewBox="0 0 52 52"
              w="52px"
              h="52px"
              color="var(--accent)"
              sx={{
                '& circle': { strokeDasharray: 151, animation: `${drawCircle} 600ms cubic-bezier(0.22,1,0.36,1) both` },
                '& path': { strokeDasharray: 36, animation: `${drawTick} 380ms cubic-bezier(0.22,1,0.36,1) 420ms both` },
                '@media (prefers-reduced-motion: reduce)': { '& circle, & path': { animation: 'none' } },
              }}
            >
              <circle cx="26" cy="26" r="24" fill="none" stroke="currentColor" strokeWidth="2" />
              <path d="M15 27l7 7 15-16" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
            </Box>
            <Heading as={headingAs === 'h1' ? 'h2' : 'h3'} ref={successRef} tabIndex={-1} size="md" fontWeight={500} letterSpacing="-0.015em" color="page.fg" _focus={{ outline: 'none' }}>
              {t.sent.title}
            </Heading>
            <Text fontSize="15px" color="page.fg-secondary" lineHeight="1.6" maxW="52ch">
              {fillNodes(t.sent.body, {
                name: sent.name ? `${t.sent.nameSep}${sent.name}` : '',
                subject: (
                  <Text as="span" color="page.fg">
                    “{sent.subject}”
                  </Text>
                ),
                email: (
                  <Text as="span" color="page.fg" fontFamily={monoFont} fontSize="14px" wordBreak="break-all">
                    {sent.email}
                  </Text>
                ),
              })}
            </Text>
            <Box as="nav" aria-label={t.sent.whileYouWait} w="100%" mt={1}>
              <Text display="flex" alignItems="center" gap={1.5} fontFamily={monoFont} fontSize="11px" letterSpacing="0.16em" textTransform="uppercase" color="page.fg-secondary" mb={2.5}>
                <ChevronRightIcon size="xs" />
                {t.sent.whileYouWait}
              </Text>
              <Flex as="ul" listStyleType="none" m={0} p={0} gap={2} flexWrap="wrap">
                <li>
                  <Button as="a" href={cvHref} {...nextStepProps}>
                    {sent.intent === 'role' ? t.sent.readCv : t.sent.seeCv}
                  </Button>
                </li>
                <li>
                  <Button as="a" href={vcardHref} download="Li-Yanpei.vcf" {...nextStepProps}>
                    {t.panel.saveVcf}
                  </Button>
                </li>
                {booking ? (
                  <li>
                    <Button as="a" href={booking} target="_blank" rel="noopener noreferrer" {...nextStepProps}>
                      {t.sent.bookCall}
                      <Box as="span" aria-hidden className="nudge-ne" display="inline-block" ml={1.5}>
                        ↗
                      </Box>
                      <span className="sr-only">{t.panel.newTab}</span>
                    </Button>
                  </li>
                ) : null}
              </Flex>
            </Box>
            <Button
              variant="ghost"
              size="md"
              mt={1}
              px={0}
              color="page.fg-secondary"
              fontFamily={monoFont}
              fontSize="13px"
              fontWeight={400}
              onClick={sendAnother}
              _hover={{ color: 'var(--accent)', bg: 'transparent' }}
            >
              {t.sent.sendAnother}
            </Button>
          </Flex>
        ) : (
          <>
            <Text display="flex" alignItems="center" gap={1.5} fontFamily={monoFont} fontSize="11px" letterSpacing="0.16em" textTransform="uppercase" color="page.fg-secondary" mb={5}>
              <ChevronRightIcon size="xs" />
              {t.form.title}
            </Text>

            <chakra.form
              ref={formRef}
              id={CONTACT_FORM_ID}
              onSubmit={onSubmit}
              onFocus={onFormFocus}
              noValidate
              aria-describedby={serverError ? 'contact-server-error' : undefined}
              sx={{ containerType: 'inline-size', scrollMarginTop: clearOfHeader('24px') }}
            >
              <VStack spacing={5} align="stretch">
                <Flex gap={4} align="flex-start" sx={responsiveRow}>
                  <FormControl isRequired isInvalid={!!shown.name} flex={1} minW={0}>
                    <FormLabel {...labelProps}>{t.form.name}</FormLabel>
                    <Input ref={nameRef} value={values.name} onChange={set('name')} onBlur={touch('name')} autoComplete="name" placeholder={t.form.namePlaceholder} {...inputProps} />
                    <FormErrorMessage fontSize="12px">{shown.name}</FormErrorMessage>
                  </FormControl>
                  <FormControl isRequired isInvalid={!!shown.email} flex={1} minW={0}>
                    <FormLabel {...labelProps}>{t.form.email}</FormLabel>
                    <Input
                      type="email"
                      value={values.email}
                      onChange={set('email')}
                      onBlur={touch('email')}
                      autoComplete="email"
                      inputMode="email"
                      placeholder={t.form.emailPlaceholder}
                      {...inputProps}
                    />
                    <FormErrorMessage fontSize="12px">{shown.email}</FormErrorMessage>
                  </FormControl>
                </Flex>

                <Flex gap={4} align="flex-start" sx={responsiveRow}>
                  <FormControl flex={1} minW={0}>
                    <FormLabel {...labelProps}>{t.form.reason}</FormLabel>
                    <Select
                      value={values.reason}
                      onChange={(e) => {
                        set('reason')(e)
                        setReasonChosen(true)
                      }}
                      lang={reasonLang}
                      {...inputProps}
                    >
                      {options.map((o) => (
                        <option key={o.label} value={o.label} lang={o.lang}>
                          {o.label}
                        </option>
                      ))}
                    </Select>
                  </FormControl>
                  <FormControl isInvalid={!!shown.subject} flex={1} minW={0}>
                    <FormLabel {...labelProps}>
                      {t.form.subject}{' '}
                      <Text as="span" color="page.fg-secondary" opacity={0.85}>
                        {t.form.optional}
                      </Text>
                    </FormLabel>
                    <Input value={values.subject} onChange={set('subject')} onBlur={touch('subject')} placeholder={values.reason || t.form.subjectPlaceholder} {...inputProps} />
                    <FormErrorMessage fontSize="12px">{shown.subject}</FormErrorMessage>
                  </FormControl>
                </Flex>

                {/* Progressive disclosure: the reason's kind adds a few optional fields. */}
                <Box aria-live="polite" className="sr-only">
                  {disclosureNote}
                </Box>
                {/* "Ask Lucian directly": where the question went. */}
                <Box aria-live="polite" className="sr-only" data-prefill-note="">
                  {prefillNote}
                </Box>
                {copy && shownIntent !== 'other' ? (
                  <MotionBox
                    key={shownIntent}
                    as="fieldset"
                    data-inquiry={shownIntent}
                    border="1px solid"
                    borderColor="page.border"
                    borderRadius="md"
                    p={{ base: 3, md: 4 }}
                    m={0}
                    minW={0}
                    initial={reduce ? false : { opacity: 0, y: -4 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
                  >
                    <Text
                      as="legend"
                      fontFamily={monoFont}
                      fontSize="11px"
                      letterSpacing="0.16em"
                      textTransform="uppercase"
                      color="page.fg-secondary"
                      px={1.5}
                      mx={-1.5}
                    >
                      {t.disclosure[shownIntent]}{' '}
                      <Text as="span" letterSpacing="0.04em" textTransform="none" opacity={0.85}>
                        {t.form.optionalGroup}
                      </Text>
                    </Text>
                    <VStack spacing={4} align="stretch" mt={1}>
                      <Flex gap={4} align="flex-start" sx={responsiveRow}>
                        {disclosed.includes('company') ? (
                          <FormControl flex={1} minW={0}>
                            <FormLabel {...labelProps}>{copy.company.label}</FormLabel>
                            <Input
                              value={values.company}
                              onChange={set('company')}
                              maxLength={INQUIRY_LIMITS.companyMax}
                              autoComplete="organization"
                              placeholder={copy.company.placeholder}
                              {...inputProps}
                            />
                          </FormControl>
                        ) : null}
                        {disclosed.includes('roleUrl') ? (
                          <FormControl isInvalid={!!shown.roleUrl} flex={1} minW={0}>
                            <FormLabel {...labelProps}>{copy.roleUrl.label}</FormLabel>
                            <Input
                              type="url"
                              inputMode="url"
                              value={values.roleUrl}
                              onChange={set('roleUrl')}
                              onBlur={touch('roleUrl')}
                              maxLength={INQUIRY_LIMITS.roleUrlMax}
                              autoComplete="url"
                              placeholder={copy.roleUrl.placeholder}
                              {...inputProps}
                            />
                            <FormErrorMessage fontSize="12px">{shown.roleUrl}</FormErrorMessage>
                          </FormControl>
                        ) : null}
                      </Flex>
                      {disclosed.includes('timeline') ? (
                        <FormControl minW={0} sx={{ '@container (min-width: 30rem)': { maxWidth: 'calc(50% - 8px)' } }}>
                          <FormLabel {...labelProps}>{copy.timeline.label}</FormLabel>
                          <Select value={values.timeline} onChange={set('timeline')} {...inputProps}>
                            <option value="">{t.form.notSure}</option>
                            {INQUIRY_TIMELINES.map((tl) => (
                              <option key={tl} value={tl}>
                                {t.timelines[tl]}
                              </option>
                            ))}
                          </Select>
                        </FormControl>
                      ) : null}
                      {shownIntent === 'role' && workStatus ? (
                        <Text fontSize="13px" color="page.fg-secondary" lineHeight="1.55" data-work-status="">
                          <Text as="span" fontFamily={monoFont} fontSize="11px" letterSpacing="0.04em" mr={2}>
                            {t.form.workAuth}
                          </Text>
                          <Text as="span" color="page.fg" lang={workStatusLang}>
                            {workStatus}
                          </Text>
                        </Text>
                      ) : null}
                    </VStack>
                  </MotionBox>
                ) : null}

                <FormControl isRequired isInvalid={!!shown.message}>
                  <FormLabel {...labelProps}>{t.form.message}</FormLabel>
                  <Textarea
                    ref={messageRef}
                    value={values.message}
                    onChange={set('message')}
                    onBlur={touch('message')}
                    maxLength={MESSAGE_MAX}
                    placeholder={t.form.messagePlaceholder}
                    rows={7}
                    resize="vertical"
                    {...inputProps}
                  />
                  <Flex justify="space-between" align="flex-start" gap={3} pt={1.5}>
                    <Box minW={0}>
                      <FormErrorMessage fontSize="12px" mt={0}>
                        {shown.message}
                      </FormErrorMessage>
                    </Box>
                    <FormHelperText mt={0} ml="auto" fontFamily={monoFont} fontSize="11px" color="page.fg-secondary" letterSpacing="0.04em" flexShrink={0}>
                      {chars.toLocaleString('en-US')} / {MESSAGE_MAX.toLocaleString('en-US')}
                    </FormHelperText>
                  </Flex>
                </FormControl>

                {/* Human check: the sum renders only after mount (SSR-safe). */}
                <FormControl isRequired isInvalid={!!shown.mathAnswer}>
                  <Flex align="center" gap={3} p={3} border="1px solid" borderColor="page.border" borderRadius="md" flexWrap="wrap" minH="58px">
                    <FormLabel {...labelProps} mb={0} mr={0} display="flex" alignItems="center" gap={3} flexWrap="wrap" requiredIndicator={<></>}>
                      <span>{t.form.humanCheck}</span>
                      <Text as="span" fontFamily="body" fontSize="14px" color="page.fg" letterSpacing="0">
                        {mathPair ? fillNodes(t.form.whatIs, { a: <strong>{mathPair.a}</strong>, b: <strong>{mathPair.b}</strong> }) : t.form.loading}
                      </Text>
                    </FormLabel>
                    <Input
                      type="text"
                      inputMode="numeric"
                      pattern="[0-9]*"
                      autoComplete="off"
                      value={values.mathAnswer}
                      onChange={set('mathAnswer')}
                      onBlur={touch('mathAnswer')}
                      isDisabled={!mathPair}
                      placeholder="?"
                      w="72px"
                      size="sm"
                      {...inputProps}
                    />
                    {!errors.mathAnswer && (
                      <Text as="span" display="inline-flex" alignItems="center" gap={1} fontFamily={monoFont} fontSize="11px" color="page.fg-secondary">
                        <Box as="span" display="inline-flex" color="var(--accent)">
                          <CheckIcon size="xs" />
                        </Box>
                        {t.form.ok}
                      </Text>
                    )}
                  </Flex>
                  <FormErrorMessage fontSize="12px">{shown.mathAnswer}</FormErrorMessage>
                  {nonceErr && (
                    <Text role="alert" mt={2} fontFamily={monoFont} fontSize="12px" color="status.error">
                      {nonceErr}
                    </Text>
                  )}
                </FormControl>

                {/* Honeypot (must stay empty) — hidden from people and assistive tech. */}
                <Box aria-hidden position="absolute" left="-9999px" top="auto" w="1px" h="1px" overflow="hidden">
                  <Input type="text" name="website" tabIndex={-1} autoComplete="off" value={honeypot} onChange={(e) => setHoneypot(e.target.value)} />
                </Box>

                {serverError && (
                  <Flex
                    id="contact-server-error"
                    role="alert"
                    gap={2.5}
                    align="flex-start"
                    px={3}
                    py={2.5}
                    border="1px solid"
                    borderColor="red.400"
                    borderRadius="md"
                    fontSize="13px"
                    color="red.600"
                    _dark={{ color: 'red.300', borderColor: 'red.300' }}
                  >
                    <Box as="span" aria-hidden fontFamily={monoFont}>
                      !
                    </Box>
                    <span>{serverError}</span>
                  </Flex>
                )}

                <Flex flexWrap="wrap" gap={3} pt={1} sx={actionRow}>
                  <HStack spacing={2}>
                    <Button
                      type="submit"
                      flex="none"
                      sx={{ '@container (width < 30rem)': { flex: '1' } }}
                      bg="accent.solid"
                      color="accent.fg"
                      _hover={{ bg: 'accent.solid-hover', _disabled: { bg: 'accent.solid' } }}
                      _active={{ bg: 'accent.solid-active' }}
                      _disabled={{ opacity: 0.45, cursor: 'not-allowed' }}
                      _focusVisible={{ outline: '2px solid var(--accent)', outlineOffset: '3px' }}
                      isDisabled={!valid}
                      isLoading={sending}
                      loadingText={t.form.sending}
                      aria-describedby={!valid && hint ? hintId : undefined}
                    >
                      {t.form.send}
                      <Box as="span" aria-hidden className="nudge" ml={1.5}>
                        →
                      </Box>
                    </Button>
                    <Button
                      variant="ghost"
                      color="page.fg-secondary"
                      _hover={{ color: 'page.fg', bg: 'transparent' }}
                      onClick={resetForm}
                      fontFamily={monoFont}
                      fontSize="13px"
                      fontWeight={400}
                    >
                      {t.form.clear}
                    </Button>
                  </HStack>
                  {mailtoBase && (
                    <Button
                      as="a"
                      href={`${mailtoBase}?subject=${encodeURIComponent(values.subject.trim() || values.reason)}&body=${encodeURIComponent(
                        `${inquiryRows(payloadOf(values))
                          .filter((r) => r.key !== 'intent')
                          .map((r) => `${r.label}: ${r.value}`)
                          .join('\n')}\n\n${values.message}`,
                      )}`}
                      variant="ghost"
                      ml="auto"
                      whiteSpace="nowrap"
                      color="page.fg-secondary"
                      _hover={{ color: 'page.fg', bg: 'transparent' }}
                      fontFamily={monoFont}
                      fontSize="13px"
                      fontWeight={400}
                    >
                      {t.form.mailApp}
                      <Box as="span" aria-hidden className="nudge-ne" display="inline-block" ml={1.5}>
                        ↗
                      </Box>
                    </Button>
                  )}
                </Flex>
                {!valid && hint && (
                  <Text id={hintId} mt={-2} fontFamily={monoFont} fontSize="11px" letterSpacing="0.02em" color="page.fg-secondary">
                    {hint}
                  </Text>
                )}
                <PrivacyNotice retentionDays={retentionDays} t={t} />
              </VStack>
            </chakra.form>
          </>
        )}
      </MotionBox>
    </Flex>
  )
}

/**
 * What happens to a message (I11): kept in the owner's private inbox only to
 * reply, and for how long. Two lines are reserved so the sentence about the
 * period — known later on pages that learn it from the nonce endpoint —
 * never shifts the layout.
 */
function PrivacyNotice({ retentionDays, t }: { retentionDays: number | null; t: ContactStrings }) {
  return (
    <Flex
      id="contact-privacy"
      gap={2.5}
      align="flex-start"
      pt={3}
      borderTop="1px solid"
      borderColor="page.border"
      fontSize="12px"
      lineHeight="1.6"
      color="page.fg-secondary"
      minH="58px"
    >
      <Box as="svg" aria-hidden viewBox="0 0 16 16" w="14px" h="14px" mt="3px" flexShrink={0} color="page.fg-secondary">
        <path
          d="M8 1.5 2.5 3.6v4.1c0 3.2 2.3 5.9 5.5 6.8 3.2-.9 5.5-3.6 5.5-6.8V3.6L8 1.5Z"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.3"
          strokeLinejoin="round"
        />
      </Box>
      <Text m={0}>
        {privacyNoticeText(retentionDays, t)}{' '}
        <Link
          href="/colophon#privacy"
          color="accent.text"
          textDecoration="underline"
          textUnderlineOffset="3px"
          textDecorationColor="var(--accent-ring)"
          _hover={{ textDecorationColor: 'currentColor' }}
        >
          {t.privacy.link}
        </Link>
      </Text>
    </Flex>
  )
}
