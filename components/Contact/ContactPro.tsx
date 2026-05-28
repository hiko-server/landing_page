import React, { useEffect, useMemo, useState } from 'react'
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
import Captcha from './Captcha'

type HomeData = {
  hero?: { phone?: string; email?: string; avatarUrl?: string; brand?: string }
  socials?: {
    github?: string
    gitlab?: string
    linkedin?: string
    whatsapp?: string
  }
}

const MotionBox = motion(Box)

const REASONS = [
  'Project Inquiry',
  'Hiring',
  'Collaboration',
  'Consulting',
  'Mentorship',
  'Other',
]

const monoFont = 'var(--font-geist-mono), monospace'

/**
 * v6 ContactPro.
 *
 * All v5 functionality preserved:
 *   - localStorage autosaved draft (clears on send)
 *   - hCaptcha gating
 *   - POST /api/contact submission with toast feedback
 *   - 'Use Mail App' fallback opens mailto:
 *   - Click-to-copy email/phone helpers
 *   - Live validation + char counter
 *
 * Visual changes:
 *   - Transparent panels with thin borders (no white card / no shadow)
 *   - Monospace section eyebrows + form labels
 *   - Indigo accent on primary submit + progress
 *   - 'tel/email' rows use the same '[label] value [copy]' rhythm as Hero
 */
export default function ContactPro({
  home,
  formOnly,
}: {
  home?: HomeData
  formOnly?: boolean
}) {
  const toast = useToast()
  const border = useColorModeValue('rgba(0,0,0,0.10)', 'rgba(255,255,255,0.12)')
  const borderStrong = useColorModeValue('rgba(0,0,0,0.20)', 'rgba(255,255,255,0.20)')
  const dim = useColorModeValue('gray.500', 'gray.500')
  const fg = useColorModeValue('gray.800', 'gray.100')

  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [reason, setReason] = useState<string>('Project Inquiry')
  const [subject, setSubject] = useState('')
  const [message, setMessage] = useState('')
  const [token, setToken] = useState<string | null>(null)
  const [sending, setSending] = useState(false)
  const [valid, setValid] = useState(false)

  // autosave draft (preserved from v5)
  useEffect(() => {
    const id = setInterval(() => {
      const draft = { name, email, reason, subject, message }
      try {
        localStorage.setItem('contact_draft', JSON.stringify(draft))
      } catch {}
    }, 1000)
    return () => clearInterval(id)
  }, [name, email, reason, subject, message])

  useEffect(() => {
    try {
      const raw = localStorage.getItem('contact_draft')
      if (raw) {
        const d = JSON.parse(raw)
        setName(d.name || '')
        setEmail(d.email || '')
        setReason(d.reason || 'Project Inquiry')
        setSubject(d.subject || '')
        setMessage(d.message || '')
      }
    } catch {}
  }, [])

  const clearDraft = () => {
    try {
      localStorage.removeItem('contact_draft')
    } catch {}
    setName('')
    setEmail('')
    setReason('Project Inquiry')
    setSubject('')
    setMessage('')
    setToken(null)
  }

  // validation
  useEffect(() => {
    const ok =
      name.trim().length > 0 &&
      /.+@.+\..+/.test(email) &&
      (subject.trim().length > 0 || Boolean(reason)) &&
      message.trim().length > 0 &&
      Boolean(token)
    setValid(!!ok)
  }, [name, email, subject, message, token, reason])

  const chars = message.length
  const pct = Math.min(100, Math.floor((chars / 1000) * 100))

  const onCopy = (txt: string, label?: string) => {
    navigator.clipboard
      .writeText(txt)
      .then(() => toast({ status: 'success', title: label || 'Copied' }))
      .catch(() => toast({ status: 'error', title: 'Copy failed' }))
  }

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!valid || sending) return
    setSending(true)
    try {
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
          token,
        }),
      })
      if (res.ok) {
        toast({ status: 'success', title: 'Sent successfully' })
        clearDraft()
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
                ▸ Reach me
              </Text>
              <Heading size="md" fontWeight={500} letterSpacing="-0.015em">
                {home?.hero?.brand || 'Contact'}
              </Heading>
              <Text fontSize="sm" color={dim} mt={1}>
                I usually reply within 24 hours.
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
                        aria-label={s.name}
                        icon={s.icon as any}
                        variant="outline"
                        size="sm"
                        borderColor={border}
                        color={dim}
                        _hover={{ borderColor: borderStrong, color: fg }}
                        onClick={() => window.open(s.href!, '_blank')}
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

        <form onSubmit={onSubmit}>
          <VStack spacing={5} align="stretch">
            <HStack spacing={4} align={{ base: 'stretch', md: 'flex-start' }} flexWrap="wrap">
              <FormControl isRequired isInvalid={!name.trim()} flex={1} minW="200px">
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
                  placeholder="Your name"
                  borderColor={border}
                  _hover={{ borderColor: borderStrong }}
                  _focus={{
                    borderColor: 'var(--accent)',
                    boxShadow: '0 0 0 1px var(--accent)',
                  }}
                />
                {!name.trim() && <FormErrorMessage fontSize="11px">Required</FormErrorMessage>}
              </FormControl>
              <FormControl
                isRequired
                isInvalid={!/.+@.+\..+/.test(email)}
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
                  placeholder="you@example.com"
                  borderColor={border}
                  _hover={{ borderColor: borderStrong }}
                  _focus={{
                    borderColor: 'var(--accent)',
                    boxShadow: '0 0 0 1px var(--accent)',
                  }}
                />
                {!/.+@.+\..+/.test(email) && (
                  <FormErrorMessage fontSize="11px">Invalid email</FormErrorMessage>
                )}
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
                isInvalid={!subject.trim() && !reason}
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
                {!subject.trim() && !reason && (
                  <FormErrorMessage fontSize="11px">Subject required</FormErrorMessage>
                )}
              </FormControl>
            </HStack>

            <FormControl isRequired isInvalid={!message.trim()}>
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
                  {chars} / 1000
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
              {!message.trim() && <FormErrorMessage fontSize="11px">Required</FormErrorMessage>}
            </FormControl>

            <Captcha
              updateToken={setToken}
              shouldReset={false}
              updateReset={() => {}}
            />

            <HStack justify="space-between" flexWrap="wrap" gap={3} pt={2}>
              <HStack>
                <Button
                  type="submit"
                  bg="var(--accent)"
                  color="white"
                  _hover={{ bg: '#4f46e5' }}
                  _active={{ bg: '#4338ca' }}
                  _disabled={{ opacity: 0.45, cursor: 'not-allowed' }}
                  isDisabled={!valid}
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
