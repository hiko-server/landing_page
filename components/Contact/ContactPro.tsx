import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Box,
  Button,
  Flex,
  Heading,
  IconButton,
  Input,
  Textarea,
  Text,
  FormControl,
  FormErrorMessage,
  FormHelperText,
  FormLabel,
  HStack,
  VStack,
  useToast,
  Tooltip,
  Divider,
  Select,
} from '@chakra-ui/react'
import { keyframes } from '@emotion/react'
import { FaGithub, FaGitlab, FaLinkedin, FaWhatsapp, FaCopy } from 'react-icons/fa'
import { motion, useReducedMotion } from 'framer-motion'

import { safeHref } from '../../lib/cvFormat'
import {
  MESSAGE_MAX,
  isContactValid,
  submitHint,
  validateContact,
  visibleErrors,
  type ContactField,
  type ContactValues,
} from '../Common/contactForm'

/** Nonces live 30 min server-side; refresh a little before that. */
const NONCE_MAX_AGE_MS = 25 * 60 * 1000
const DRAFT_KEY = 'contact_draft'

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
  }
}

const MotionBox = motion(Box)

// Built-in defaults — used when home.json's contact block is missing or
// any individual field is blank. Kept in sync with HomeEditor's
// DEFAULT_CONTACT_REASONS so the admin and renderer agree.
const DEFAULT_REASONS = ['Project Inquiry', 'Hiring', 'Collaboration', 'Consulting', 'Mentorship', 'Other']
const DEFAULT_EYEBROW = '▸ Reach me'
const DEFAULT_BLURB = 'I usually reply within 24 hours.'

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

type Sent = { name: string; email: string; subject: string }

/**
 * Contact panel: optional "reach me" info card + the message form.
 *
 *   - Inline validation (shown once a field is left, or after a send
 *     attempt); each error is announced politely and linked to its field.
 *   - "Send" stays disabled until the form is valid, with a hint saying
 *     exactly what is still missing.
 *   - On success the form is replaced in place by a confirmation (animated
 *     check, what was sent, "Send another"), and focus moves to it.
 *   - API contract unchanged: GET /api/contact/nonce, then POST /api/contact
 *     with { name, email, subject, message, nonce, mathAnswer, hp }.
 *   - Human check: signed nonce (server-verified, ≥ 2s old) + visible sum +
 *     hidden honeypot. Drafts autosave locally and clear on send.
 */
export default function ContactPro({
  home,
  formOnly,
  headingAs = 'h2',
}: {
  home?: HomeData
  formOnly?: boolean
  /** The info-panel heading is the page title on /contact. */
  headingAs?: 'h1' | 'h2'
}) {
  const toast = useToast()
  const reduce = useReducedMotion()

  // Admin copy wins when non-blank; blank / missing entries use the defaults.
  const reasons = useMemo(() => {
    const list = (home?.contact?.reasons || []).map((r) => (typeof r === 'string' ? r.trim() : '')).filter(Boolean)
    return list.length ? list : DEFAULT_REASONS
  }, [home?.contact?.reasons])
  const eyebrowText = (home?.contact?.eyebrow ?? '').trim() || DEFAULT_EYEBROW
  const headingText = (home?.contact?.heading ?? '').trim() || home?.hero?.brand || 'Contact'
  const blurbText = (home?.contact?.blurb ?? '').trim() || DEFAULT_BLURB
  const email = (home?.hero?.email || '').trim()
  const phone = (home?.hero?.phone || '').trim()
  const mailtoBase = email ? safeHref(`mailto:${email}`) : ''

  const [values, setValues] = useState<ContactValues>({
    name: '',
    email: '',
    reason: reasons[0],
    subject: '',
    message: '',
    mathAnswer: '',
  })
  const set = (k: keyof ContactValues) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setValues((v) => ({ ...v, [k]: e.target.value }))

  const [touched, setTouched] = useState<Partial<Record<ContactField, boolean>>>({})
  const touch = (k: ContactField) => () => setTouched((t) => (t[k] ? t : { ...t, [k]: true }))
  const [attempted, setAttempted] = useState(false)
  const [sending, setSending] = useState(false)
  const [serverError, setServerError] = useState<string | null>(null)
  const [sent, setSent] = useState<Sent | null>(null)
  const [honeypot, setHoneypot] = useState('')

  // The sum is generated after mount so SSR and hydration markup match.
  const [mathPair, setMathPair] = useState<{ a: number; b: number } | null>(null)
  const newMathPair = () => setMathPair({ a: Math.floor(Math.random() * 9) + 1, b: Math.floor(Math.random() * 9) + 1 })
  useEffect(() => {
    setMathPair({ a: Math.floor(Math.random() * 9) + 1, b: Math.floor(Math.random() * 9) + 1 })
  }, [])
  const expectedMath = mathPair ? mathPair.a + mathPair.b : null

  const errors = validateContact(values, expectedMath)
  const valid = isContactValid(errors)
  const shown = visibleErrors(errors, touched, attempted)
  const hint = submitHint(errors)

  const nameRef = useRef<HTMLInputElement | null>(null)
  const successRef = useRef<HTMLHeadingElement | null>(null)

  // Signed nonce: fetched on first interaction (not on every page view) and
  // refreshed near its 30-minute expiry so a slow message never fails.
  const [nonce, setNonce] = useState<string | null>(null)
  const [nonceErr, setNonceErr] = useState<string | null>(null)
  const nonceAtRef = useRef(0)
  const fetchNonce = useCallback(async (): Promise<string | null> => {
    try {
      const r = await fetch('/api/contact/nonce', { cache: 'no-store' })
      if (!r.ok) throw new Error(String(r.status))
      const d = await r.json()
      nonceAtRef.current = Date.now()
      setNonce(d.token)
      setNonceErr(null)
      return d.token as string
    } catch {
      nonceAtRef.current = 0
      setNonceErr('Verification couldn’t start — check your connection and try again.')
      return null
    }
  }, [])
  const ensureNonce = useCallback(async (): Promise<string | null> => {
    if (nonce && Date.now() - nonceAtRef.current < NONCE_MAX_AGE_MS) return nonce
    return fetchNonce()
  }, [nonce, fetchNonce])
  const warmNonce = () => {
    if (!nonce && !nonceAtRef.current) {
      nonceAtRef.current = 1 // in flight
      fetchNonce()
    }
  }

  // Draft autosave (name / email / reason / subject / message only).
  useEffect(() => {
    if (sent) return
    const id = setTimeout(() => {
      const { name, email: em, reason, subject, message } = values
      try {
        localStorage.setItem(DRAFT_KEY, JSON.stringify({ name, email: em, reason, subject, message }))
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
      }))
    } catch {
      /* ignore malformed draft */
    }
    // Restoring a draft runs once, on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const resetForm = () => {
    try {
      localStorage.removeItem(DRAFT_KEY)
    } catch {
      /* ignore */
    }
    setValues({ name: '', email: '', reason: reasons[0], subject: '', message: '', mathAnswer: '' })
    setTouched({})
    setAttempted(false)
    setServerError(null)
    setHoneypot('')
  }

  const sendAnother = () => {
    setSent(null)
    newMathPair()
    // Focus returns to the first field once the form is back in the DOM.
    requestAnimationFrame(() => nameRef.current?.focus())
  }

  useEffect(() => {
    if (sent) successRef.current?.focus()
  }, [sent])

  const onCopy = (txt: string, label: string) => {
    navigator.clipboard
      .writeText(txt)
      .then(() => toast({ status: 'success', title: label, duration: 2000 }))
      .catch(() => toast({ status: 'error', title: 'Copy failed' }))
  }

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setAttempted(true)
    if (!valid || sending) return
    setSending(true)
    setServerError(null)
    try {
      const token = await ensureNonce()
      if (!token) return
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
          message: `Reason: ${values.reason}\n\n${values.message}`,
          nonce: token,
          mathAnswer: Number(values.mathAnswer),
          hp: honeypot, // expected to be ''
        }),
      })
      if (res.ok) {
        setSent({ name: values.name.trim(), email: values.email.trim(), subject })
        resetForm()
        // A nonce is single-purpose; take a fresh one for any follow-up.
        setNonce(null)
        nonceAtRef.current = 0
      } else {
        const d = await res.json().catch(() => ({}))
        setServerError(typeof d?.error === 'string' && d.error ? d.error : 'The message couldn’t be sent. Please try again.')
      }
    } catch {
      setServerError('Network error — check your connection and try again.')
    } finally {
      setSending(false)
    }
  }

  const contactRows = [
    email ? { label: 'email', value: email, copied: 'Email copied' } : null,
    phone ? { label: 'tel', value: phone, copied: 'Phone copied' } : null,
  ].filter((r): r is { label: string; value: string; copied: string } => r !== null)

  const socials = [
    { name: 'GitHub', icon: <FaGithub />, href: safeHref(home?.socials?.github) },
    { name: 'GitLab', icon: <FaGitlab />, href: safeHref(home?.socials?.gitlab) },
    { name: 'LinkedIn', icon: <FaLinkedin />, href: safeHref(home?.socials?.linkedin) },
    { name: 'WhatsApp', icon: <FaWhatsapp />, href: safeHref(home?.socials?.whatsapp) },
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
              <Text fontFamily={monoFont} fontSize="11px" letterSpacing="0.16em" textTransform="uppercase" color="page.fg-secondary" mb={2}>
                {eyebrowText}
              </Text>
              <Heading as={headingAs} size="md" fontWeight={500} letterSpacing="-0.015em" color="page.fg">
                {headingText}
              </Heading>
              <Text fontSize="sm" color="page.fg-secondary" mt={1}>
                {blurbText}
              </Text>
            </Box>

            {contactRows.length > 0 && (
              <>
                <Divider borderColor="page.border" />
                <VStack as="ul" listStyleType="none" align="stretch" spacing={2}>
                  {contactRows.map((it) => (
                    <Flex as="li" key={it.label} justify="space-between" align="center" gap={2}>
                      <HStack spacing={3} minW={0}>
                        <Text fontFamily={monoFont} fontSize="11px" color="page.fg-secondary" letterSpacing="0.04em" w="44px" flexShrink={0}>
                          {it.label}
                        </Text>
                        <Text fontSize="14px" color="page.fg" isTruncated>
                          {it.value}
                        </Text>
                      </HStack>
                      <Tooltip label="Copy" hasArrow openDelay={300}>
                        <IconButton
                          aria-label={`Copy ${it.label === 'tel' ? 'phone number' : 'email address'}`}
                          icon={<FaCopy />}
                          size="sm"
                          variant="ghost"
                          color="page.fg-secondary"
                          _hover={{ color: 'var(--accent)', bg: 'transparent' }}
                          onClick={() => onCopy(it.value, it.copied)}
                        />
                      </Tooltip>
                    </Flex>
                  ))}
                </VStack>
              </>
            )}

            {socials.length > 0 && (
              <>
                <Divider borderColor="page.border" />
                <Box>
                  <Text fontFamily={monoFont} fontSize="11px" letterSpacing="0.16em" textTransform="uppercase" color="page.fg-secondary" mb={3}>
                    ▸ Elsewhere
                  </Text>
                  <HStack as="ul" listStyleType="none" spacing={2}>
                    {socials.map((s) => (
                      <li key={s.name}>
                        <IconButton
                          as="a"
                          href={s.href}
                          target="_blank"
                          rel="noopener noreferrer"
                          aria-label={`${s.name} (opens in a new tab)`}
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
              Message sent
            </Heading>
            <Text fontSize="15px" color="page.fg-secondary" lineHeight="1.6" maxW="52ch">
              Thanks{sent.name ? `, ${sent.name}` : ''} — your message about{' '}
              <Text as="span" color="page.fg">
                “{sent.subject}”
              </Text>{' '}
              is on its way. I’ll reply to{' '}
              <Text as="span" color="page.fg" fontFamily={monoFont} fontSize="14px" wordBreak="break-all">
                {sent.email}
              </Text>
              .
            </Text>
            <Button
              variant="outline"
              size="md"
              mt={2}
              borderColor="page.border-strong"
              color="page.fg"
              fontFamily={monoFont}
              fontSize="13px"
              fontWeight={400}
              onClick={sendAnother}
              _hover={{ borderColor: 'var(--accent)', color: 'var(--accent)' }}
            >
              Send another message
            </Button>
          </Flex>
        ) : (
          <>
            <Text fontFamily={monoFont} fontSize="11px" letterSpacing="0.16em" textTransform="uppercase" color="page.fg-secondary" mb={5}>
              ▸ Send a message
            </Text>

            <form onSubmit={onSubmit} onFocus={warmNonce} noValidate aria-describedby={serverError ? 'contact-server-error' : undefined}>
              <VStack spacing={5} align="stretch">
                <Flex gap={4} direction={{ base: 'column', sm: 'row' }} align="flex-start">
                  <FormControl isRequired isInvalid={!!shown.name} flex={1} minW={0}>
                    <FormLabel {...labelProps}>Name</FormLabel>
                    <Input ref={nameRef} value={values.name} onChange={set('name')} onBlur={touch('name')} autoComplete="name" placeholder="Your name" {...inputProps} />
                    <FormErrorMessage fontSize="12px">{shown.name}</FormErrorMessage>
                  </FormControl>
                  <FormControl isRequired isInvalid={!!shown.email} flex={1} minW={0}>
                    <FormLabel {...labelProps}>Email</FormLabel>
                    <Input
                      type="email"
                      value={values.email}
                      onChange={set('email')}
                      onBlur={touch('email')}
                      autoComplete="email"
                      inputMode="email"
                      placeholder="you@example.com"
                      {...inputProps}
                    />
                    <FormErrorMessage fontSize="12px">{shown.email}</FormErrorMessage>
                  </FormControl>
                </Flex>

                <Flex gap={4} direction={{ base: 'column', sm: 'row' }} align="flex-start">
                  <FormControl flex={1} minW={0}>
                    <FormLabel {...labelProps}>Reason</FormLabel>
                    <Select value={values.reason} onChange={set('reason')} {...inputProps}>
                      {reasons.map((r) => (
                        <option key={r} value={r}>
                          {r}
                        </option>
                      ))}
                    </Select>
                  </FormControl>
                  <FormControl isInvalid={!!shown.subject} flex={1} minW={0}>
                    <FormLabel {...labelProps}>
                      Subject{' '}
                      <Text as="span" color="page.fg-secondary" opacity={0.85}>
                        (optional)
                      </Text>
                    </FormLabel>
                    <Input value={values.subject} onChange={set('subject')} onBlur={touch('subject')} placeholder={values.reason || 'Subject'} {...inputProps} />
                    <FormErrorMessage fontSize="12px">{shown.subject}</FormErrorMessage>
                  </FormControl>
                </Flex>

                <FormControl isRequired isInvalid={!!shown.message}>
                  <FormLabel {...labelProps}>Message</FormLabel>
                  <Textarea
                    value={values.message}
                    onChange={set('message')}
                    onBlur={touch('message')}
                    maxLength={MESSAGE_MAX}
                    placeholder="Tell me a bit more…"
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
                      <span>human check</span>
                      <Text as="span" fontFamily="body" fontSize="14px" color="page.fg" letterSpacing="0">
                        {mathPair ? (
                          <>
                            What is <strong>{mathPair.a}</strong> + <strong>{mathPair.b}</strong>?
                          </>
                        ) : (
                          'Loading…'
                        )}
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
                      <Text as="span" fontFamily={monoFont} fontSize="11px" color="page.fg-secondary">
                        <Box as="span" aria-hidden color="var(--accent)">
                          ✓
                        </Box>{' '}
                        ok
                      </Text>
                    )}
                  </Flex>
                  <FormErrorMessage fontSize="12px">{shown.mathAnswer}</FormErrorMessage>
                  {nonceErr && (
                    <Text role="alert" mt={2} fontFamily={monoFont} fontSize="12px" color="red.500" _dark={{ color: 'red.300' }}>
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

                <Flex direction={{ base: 'column', sm: 'row' }} justify="space-between" align={{ base: 'stretch', sm: 'center' }} gap={3} pt={1}>
                  <HStack spacing={2}>
                    <Button
                      type="submit"
                      flex={{ base: 1, sm: 'none' }}
                      bg="var(--accent)"
                      color="white"
                      _hover={{ bg: '#4f46e5', _disabled: { bg: 'var(--accent)' } }}
                      _active={{ bg: '#4338ca' }}
                      _disabled={{ opacity: 0.45, cursor: 'not-allowed' }}
                      _focusVisible={{ outline: '2px solid var(--accent)', outlineOffset: '3px' }}
                      isDisabled={!valid}
                      isLoading={sending}
                      loadingText="Sending…"
                      aria-describedby={!valid && hint ? hintId : undefined}
                    >
                      Send message →
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
                      Clear
                    </Button>
                  </HStack>
                  {mailtoBase && (
                    <Button
                      as="a"
                      href={`${mailtoBase}?subject=${encodeURIComponent(values.subject.trim() || values.reason)}&body=${encodeURIComponent(
                        `Reason: ${values.reason}\n\n${values.message}`,
                      )}`}
                      variant="ghost"
                      color="page.fg-secondary"
                      _hover={{ color: 'page.fg', bg: 'transparent' }}
                      fontFamily={monoFont}
                      fontSize="13px"
                      fontWeight={400}
                    >
                      Use mail app ↗
                    </Button>
                  )}
                </Flex>
                {!valid && hint && (
                  <Text id={hintId} mt={-2} fontFamily={monoFont} fontSize="11px" letterSpacing="0.02em" color="page.fg-secondary">
                    {hint}
                  </Text>
                )}
              </VStack>
            </form>
          </>
        )}
      </MotionBox>
    </Flex>
  )
}
