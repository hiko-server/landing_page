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
  FormLabel,
  HStack,
  VStack,
  useColorModeValue,
  useToast,
  Progress,
  Tooltip,
  Divider,
  Select,
} from '@chakra-ui/react'
import {
  FaGithub,
  FaGitlab,
  FaLinkedin,
  FaWhatsapp,
  FaCopy,
} from 'react-icons/fa'
import { motion } from 'framer-motion'

const MESSAGE_MAX = 5000
/** Nonces live 30 min server-side; refresh a little before that. */
const NONCE_MAX_AGE_MS = 25 * 60 * 1000

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
const DEFAULT_REASONS = [
  'Project Inquiry',
  'Hiring',
  'Collaboration',
  'Consulting',
  'Mentorship',
  'Other',
]
const DEFAULT_EYEBROW = '▸ Reach me'
const DEFAULT_BLURB = 'I usually reply within 24 hours.'

const monoFont = 'var(--font-geist-mono), monospace'

/**
 * v6 ContactPro.
 *
 * v5 functionality preserved:
 *   - localStorage autosaved draft (clears on send)
 *   - POST /api/contact submission with toast feedback
 *   - 'Use Mail App' fallback opens mailto:
 *   - Click-to-copy email/phone helpers
 *   - Live validation + char counter
 *
 * v6 changes:
 *   - hCaptcha replaced with three-layer human check:
 *       1. Signed nonce from /api/contact/nonce (server-verified, ≥ 2s elapsed)
 *       2. Math captcha (visible UX deterrent)
 *       3. Honeypot 'hp' hidden field (catches dumb form-fillers)
 *     Server enforces (1) + (3); (2) is for human-visible reassurance.
 *   - No external dep, no HCAPTCHA_SECRET required.
 *   - Transparent panels, monospace eyebrows, indigo accent on primary submit.
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
  const border = useColorModeValue('rgba(0,0,0,0.10)', 'rgba(255,255,255,0.12)')
  const borderStrong = useColorModeValue('rgba(0,0,0,0.20)', 'rgba(255,255,255,0.20)')
  const dim = useColorModeValue('gray.600', 'gray.500')
  const fg = useColorModeValue('gray.800', 'gray.100')

  // Resolve editable copy + reasons once per render. Admin values win
  // when non-blank; blank/missing entries fall back to the defaults.
  const REASONS =
    home?.contact?.reasons && home.contact.reasons.length > 0
      ? home.contact.reasons
      : DEFAULT_REASONS
  const eyebrowText = (home?.contact?.eyebrow ?? '').trim() || DEFAULT_EYEBROW
  const headingText =
    (home?.contact?.heading ?? '').trim() || home?.hero?.brand || 'Contact'
  const blurbText = (home?.contact?.blurb ?? '').trim() || DEFAULT_BLURB

  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [reason, setReason] = useState<string>(REASONS[0])
  const [subject, setSubject] = useState('')
  const [message, setMessage] = useState('')
  const [sending, setSending] = useState(false)
  const [valid, setValid] = useState(false)

  // v6 human check — replaces hCaptcha. Stateless: a 2-number addition
  // (UX deterrent) + a signed nonce fetched from /api/contact/nonce
  // (real verification) + an invisible 'hp' honeypot field.
  //
  // The math pair must be generated AFTER mount (in useEffect), otherwise SSR
  // and the client hydration produce different random numbers and React
  // throws 'Text content does not match server-rendered HTML'.
  const [mathPair, setMathPair] = useState<{ a: number; b: number } | null>(null)
  const expectedMath = mathPair ? mathPair.a + mathPair.b : null
  const [mathAnswer, setMathAnswer] = useState('')
  const [honeypot, setHoneypot] = useState('')
  const [nonce, setNonce] = useState<string | null>(null)
  const [nonceErr, setNonceErr] = useState<string | null>(null)
  const nonceAtRef = useRef(0)
  const [submitted, setSubmitted] = useState(false)
  const [touched, setTouched] = useState<Record<string, boolean>>({})
  const touch = (k: string) => setTouched((t) => (t[k] ? t : { ...t, [k]: true }))
  const showErr = (k: string) => submitted || !!touched[k]

  // Generate the math pair only on the client to keep SSR markup deterministic.
  useEffect(() => {
    setMathPair({
      a: Math.floor(Math.random() * 9) + 1,
      b: Math.floor(Math.random() * 9) + 1,
    })
  }, [])

  // The signed nonce is fetched on first interaction (not on every page
  // view) and re-fetched once it is close to its 30-minute expiry, so a
  // message composed slowly never fails verification.
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
      setNonceErr('Verification could not initialize — check your connection and try again')
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

  // autosave draft (preserved from v5)
  useEffect(() => {
    const id = setTimeout(() => {
      const draft = { name, email, reason, subject, message }
      try {
        localStorage.setItem('contact_draft', JSON.stringify(draft))
      } catch {
        /* storage unavailable — drafts are a convenience only */
      }
    }, 600)
    return () => clearTimeout(id)
  }, [name, email, reason, subject, message])

  useEffect(() => {
    try {
      const raw = localStorage.getItem('contact_draft')
      if (raw) {
        const d = JSON.parse(raw)
        setName(d.name || '')
        setEmail(d.email || '')
        setReason(d.reason || REASONS[0])
        setSubject(d.subject || '')
        setMessage(d.message || '')
      }
    } catch {
      /* ignore malformed draft */
    }
    // REASONS is derived from props once; restoring a draft runs only on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const clearDraft = () => {
    try {
      localStorage.removeItem('contact_draft')
    } catch {
      /* ignore */
    }
    setSubmitted(false)
    setTouched({})
    setName('')
    setEmail('')
    setReason(REASONS[0])
    setSubject('')
    setMessage('')
    setMathAnswer('')
    setHoneypot('')
  }

  // validation
  useEffect(() => {
    const mathOk =
      expectedMath !== null && mathAnswer.trim() === String(expectedMath)
    const ok =
      name.trim().length > 0 &&
      /.+@.+\..+/.test(email) &&
      (subject.trim().length > 0 || Boolean(reason)) &&
      message.trim().length > 0 &&
      message.length <= MESSAGE_MAX &&
      mathOk
    setValid(!!ok)
  }, [name, email, subject, message, mathAnswer, expectedMath, reason])

  const chars = message.length
  const pct = Math.min(100, Math.floor((chars / MESSAGE_MAX) * 100))

  const onCopy = (txt: string, label?: string) => {
    navigator.clipboard
      .writeText(txt)
      .then(() => toast({ status: 'success', title: label || 'Copied' }))
      .catch(() => toast({ status: 'error', title: 'Copy failed' }))
  }

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSubmitted(true)
    if (!valid || sending) return
    setSending(true)
    try {
      const token = await ensureNonce()
      if (!token) return
      // The server requires ≥2s between issuing the nonce and submitting.
      const age = Date.now() - nonceAtRef.current
      if (age < 2100) await new Promise((r) => setTimeout(r, 2100 - age))
      const fullSubject = subject || reason
      const body = `Reason: ${reason}\n\n${message}`
      const res = await fetch('/api/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          email,
          subject: fullSubject,
          message: body,
          nonce: token,
          mathAnswer: Number(mathAnswer),
          hp: honeypot, // expected to be ''
        }),
      })
      if (res.ok) {
        toast({ status: 'success', title: 'Message sent', description: 'Thanks — I’ll reply by email.' })
        clearDraft()
        // A nonce is single-purpose; take a fresh one for any follow-up.
        setNonce(null)
        nonceAtRef.current = 0
      } else {
        const d = await res.json().catch(() => ({}))
        toast({ status: 'error', title: d?.error || 'Failed to send' })
      }
    } catch (e: any) {
      toast({ status: 'error', title: e?.message || 'Network error' })
    } finally {
      setSending(false)
    }
  }

  const contactRows = useMemo(() => {
    const items: Array<{ label: string; value: string; onClick: () => void }> = []
    if (home?.hero?.email)
      items.push({
        label: 'email',
        value: home.hero.email,
        onClick: () => onCopy(home.hero?.email || '', 'Email copied'),
      })
    if (home?.hero?.phone)
      items.push({
        label: 'tel',
        value: home.hero.phone,
        onClick: () => onCopy(home.hero?.phone || '', 'Phone copied'),
      })
    return items
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [home?.hero?.email, home?.hero?.phone])

  const socials: { name: string; icon: React.ReactNode; href?: string }[] = [
    { name: 'GitHub', icon: <FaGithub />, href: home?.socials?.github },
    { name: 'GitLab', icon: <FaGitlab />, href: home?.socials?.gitlab },
    { name: 'LinkedIn', icon: <FaLinkedin />, href: home?.socials?.linkedin },
    { name: 'WhatsApp', icon: <FaWhatsapp />, href: home?.socials?.whatsapp },
  ].filter((s) => Boolean(s.href)) as any

  return (
    <Flex
      direction={{ base: 'column', md: 'row' }}
      gap={6}
      w="100%"
      maxW="var(--container-content)"
    >
      {/* Info Panel (hidden when formOnly) */}
      {!formOnly && (
        <MotionBox
          flex={{ base: 'none', md: '0 0 340px' }}
          bg="transparent"
          borderWidth="1px"
          borderColor={border}
          borderRadius="lg"
          p={6}
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35 }}
        >
          <VStack align="stretch" spacing={5}>
            <Box>
              <Text
                fontFamily={monoFont}
                fontSize="10px"
                letterSpacing="0.16em"
                textTransform="uppercase"
                color={dim}
                mb={2}
              >
                {eyebrowText}
              </Text>
              <Heading as={headingAs} size="md" fontWeight={500} letterSpacing="-0.015em">
                {headingText}
              </Heading>
              <Text fontSize="sm" color={dim} mt={1}>
                {blurbText}
              </Text>
            </Box>

            <Divider borderColor={border} />

            <VStack align="stretch" spacing={2}>
              {contactRows.map((it, idx) => (
                <Flex key={idx} justify="space-between" align="center" gap={2}>
                  <HStack spacing={3} minW={0}>
                    <Text
                      fontFamily={monoFont}
                      fontSize="11px"
                      color={dim}
                      letterSpacing="0.04em"
                      w="44px"
                      flexShrink={0}
                    >
                      {it.label}
                    </Text>
                    <Text fontSize="14px" color={fg} isTruncated>
                      {it.value}
                    </Text>
                  </HStack>
                  <Tooltip label="Copy" hasArrow>
                    <IconButton
                      aria-label="Copy"
                      icon={<FaCopy />}
                      size="xs"
                      variant="ghost"
                      color={dim}
                      _hover={{ color: 'var(--accent)' }}
                      onClick={it.onClick}
                    />
                  </Tooltip>
                </Flex>
              ))}
            </VStack>

            {socials.length > 0 && (
              <>
                <Divider borderColor={border} />
                <Box>
                  <Text
                    fontFamily={monoFont}
                    fontSize="10px"
                    letterSpacing="0.16em"
                    textTransform="uppercase"
                    color={dim}
                    mb={3}
                  >
                    ▸ Elsewhere
                  </Text>
                  <HStack spacing={2}>
                    {socials.map((s) => (
                      <IconButton
                        key={s.name}
                        as="a"
                        href={s.href}
                        target="_blank"
                        rel="noopener noreferrer"
                        aria-label={s.name}
                        icon={s.icon as any}
                        variant="outline"
                        size="sm"
                        borderColor={border}
                        color={dim}
                        _hover={{ borderColor: borderStrong, color: fg }}
                      />
                    ))}
                  </HStack>
                </Box>
              </>
            )}
          </VStack>
        </MotionBox>
      )}

      {/* Form Panel */}
      <MotionBox
        flex="1"
        bg="transparent"
        borderWidth="1px"
        borderColor={border}
        borderRadius="lg"
        p={6}
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.05 }}
      >
        <Text
          fontFamily={monoFont}
          fontSize="10px"
          letterSpacing="0.16em"
          textTransform="uppercase"
          color={dim}
          mb={5}
        >
          ▸ Send a message
        </Text>

        <form onSubmit={onSubmit} onFocus={warmNonce} noValidate>
          <VStack spacing={5} align="stretch">
            <HStack spacing={4} align={{ base: 'stretch', md: 'flex-start' }} flexWrap="wrap">
              <FormControl isRequired isInvalid={showErr('name') && !name.trim()} flex={1} minW="200px">
                <FormLabel
                  fontFamily={monoFont}
                  fontSize="11px"
                  letterSpacing="0.04em"
                  color={dim}
                  fontWeight={400}
                  mb={1.5}
                >
                  Name
                </FormLabel>
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  onBlur={() => touch('name')}
                  autoComplete="name"
                  placeholder="Your name"
                  borderColor={border}
                  _hover={{ borderColor: borderStrong }}
                  _focus={{
                    borderColor: 'var(--accent)',
                    boxShadow: '0 0 0 1px var(--accent)',
                  }}
                />
                <FormErrorMessage fontSize="11px">Required</FormErrorMessage>
              </FormControl>
              <FormControl
                isRequired
                isInvalid={showErr('email') && !/.+@.+\..+/.test(email)}
                flex={1}
                minW="200px"
              >
                <FormLabel
                  fontFamily={monoFont}
                  fontSize="11px"
                  letterSpacing="0.04em"
                  color={dim}
                  fontWeight={400}
                  mb={1.5}
                >
                  Email
                </FormLabel>
                <Input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  onBlur={() => touch('email')}
                  autoComplete="email"
                  inputMode="email"
                  placeholder="you@example.com"
                  borderColor={border}
                  _hover={{ borderColor: borderStrong }}
                  _focus={{
                    borderColor: 'var(--accent)',
                    boxShadow: '0 0 0 1px var(--accent)',
                  }}
                />
                <FormErrorMessage fontSize="11px">Enter a valid email</FormErrorMessage>
              </FormControl>
            </HStack>

            <HStack spacing={4} align={{ base: 'stretch', md: 'flex-start' }} flexWrap="wrap">
              <FormControl flex={1} minW="200px">
                <FormLabel
                  fontFamily={monoFont}
                  fontSize="11px"
                  letterSpacing="0.04em"
                  color={dim}
                  fontWeight={400}
                  mb={1.5}
                >
                  Reason
                </FormLabel>
                <Select
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  borderColor={border}
                  _hover={{ borderColor: borderStrong }}
                  _focus={{
                    borderColor: 'var(--accent)',
                    boxShadow: '0 0 0 1px var(--accent)',
                  }}
                >
                  {REASONS.map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </Select>
              </FormControl>
              <FormControl
                isRequired
                isInvalid={showErr('subject') && !subject.trim() && !reason}
                flex={1}
                minW="200px"
              >
                <FormLabel
                  fontFamily={monoFont}
                  fontSize="11px"
                  letterSpacing="0.04em"
                  color={dim}
                  fontWeight={400}
                  mb={1.5}
                >
                  Subject
                </FormLabel>
                <Input
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  placeholder="Subject"
                  borderColor={border}
                  _hover={{ borderColor: borderStrong }}
                  _focus={{
                    borderColor: 'var(--accent)',
                    boxShadow: '0 0 0 1px var(--accent)',
                  }}
                />
                <FormErrorMessage fontSize="11px">Subject required</FormErrorMessage>
              </FormControl>
            </HStack>

            <FormControl isRequired isInvalid={showErr('message') && (!message.trim() || message.length > MESSAGE_MAX)}>
              <FormLabel
                fontFamily={monoFont}
                fontSize="11px"
                letterSpacing="0.04em"
                color={dim}
                fontWeight={400}
                mb={1.5}
              >
                Message
              </FormLabel>
              <Textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                onBlur={() => touch('message')}
                maxLength={MESSAGE_MAX}
                placeholder="Tell me a bit more…"
                rows={8}
                borderColor={border}
                _hover={{ borderColor: borderStrong }}
                _focus={{
                  borderColor: 'var(--accent)',
                  boxShadow: '0 0 0 1px var(--accent)',
                }}
              />
              <HStack justify="space-between" pt={2}>
                <Text fontFamily={monoFont} fontSize="10px" color={dim} letterSpacing="0.04em">
                  {chars} / {MESSAGE_MAX}
                </Text>
                <Progress
                  w="180px"
                  size="xs"
                  value={pct}
                  sx={{
                    '& > div': {
                      background: 'var(--accent)',
                    },
                    background: border,
                  }}
                />
              </HStack>
              <FormErrorMessage fontSize="11px">Required</FormErrorMessage>
            </FormControl>

            {/* v6 three-layer human check. Honeypot 'hp' is hidden via aria
                + tab-index + clip-path so screen readers and humans skip it.
                The math pair renders only after mount (mathPair !== null)
                so SSR and CSR markup match. */}
            <Box>
              <Flex
                align="center"
                gap={3}
                p={3}
                border="1px solid"
                borderColor={border}
                borderRadius="md"
                flexWrap="wrap"
                minH="56px"
              >
                <Text
                  fontFamily={monoFont}
                  fontSize="11px"
                  color={dim}
                  letterSpacing="0.04em"
                >
                  human check
                </Text>
                {mathPair ? (
                  <>
                    <Text fontSize="14px" color={fg}>
                      What is <strong>{mathPair.a}</strong> +{' '}
                      <strong>{mathPair.b}</strong>?
                    </Text>
                    <Input
                      type="number"
                      inputMode="numeric"
                      value={mathAnswer}
                      onChange={(e) => setMathAnswer(e.target.value)}
                      isInvalid={submitted && mathAnswer.trim() !== String(expectedMath)}
                      placeholder="?"
                      w="80px"
                      size="sm"
                      borderColor={border}
                      _focus={{
                        borderColor: 'var(--accent)',
                        boxShadow: '0 0 0 1px var(--accent)',
                      }}
                      aria-label="Human check answer"
                    />
                    {mathAnswer && mathAnswer.trim() === String(expectedMath) && (
                      <Text fontFamily={monoFont} fontSize="11px" color="green.400">
                        ✓ ok
                      </Text>
                    )}
                  </>
                ) : (
                  <Text fontFamily={monoFont} fontSize="11px" color={dim}>
                    loading…
                  </Text>
                )}
                {nonceErr && (
                  <Text fontFamily={monoFont} fontSize="11px" color="red.400">
                    {nonceErr}
                  </Text>
                )}
              </Flex>
              {/* Honeypot (must stay empty). Hidden visually + from a11y. */}
              <Box
                aria-hidden
                tabIndex={-1}
                position="absolute"
                left="-9999px"
                top="auto"
                width="1px"
                height="1px"
                overflow="hidden"
              >
                <Input
                  type="text"
                  name="website"
                  tabIndex={-1}
                  autoComplete="off"
                  value={honeypot}
                  onChange={(e) => setHoneypot(e.target.value)}
                />
              </Box>
            </Box>

            <HStack justify="space-between" flexWrap="wrap" gap={3} pt={2}>
              <HStack>
                <Button
                  type="submit"
                  bg="var(--accent)"
                  color="white"
                  _hover={{ bg: '#4f46e5' }}
                  _active={{ bg: '#4338ca' }}
                  _disabled={{ opacity: 0.45, cursor: 'not-allowed' }}
                  aria-disabled={!valid}
                  opacity={valid ? 1 : 0.6}
                  isLoading={sending}
                  loadingText="Sending…"
                  size="md"
                >
                  Send message →
                </Button>
                <Button
                  variant="ghost"
                  size="md"
                  color={dim}
                  _hover={{ color: fg, bg: 'transparent' }}
                  onClick={clearDraft}
                  fontFamily={monoFont}
                  fontSize="13px"
                >
                  Clear
                </Button>
              </HStack>
              <Button
                variant="ghost"
                size="md"
                color={dim}
                _hover={{ color: fg, bg: 'transparent' }}
                onClick={() => {
                  const fullSubject = encodeURIComponent(subject || reason)
                  const body = encodeURIComponent(`Reason: ${reason}\n\n${message}`)
                  window.location.href = `mailto:${
                    home?.hero?.email || ''
                  }?subject=${fullSubject}&body=${body}`
                }}
                fontFamily={monoFont}
                fontSize="13px"
              >
                Use mail app ↗
              </Button>
            </HStack>
          </VStack>
        </form>
      </MotionBox>
    </Flex>
  )
}
