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
  Avatar,
  Select,
} from '@chakra-ui/react'
import {
  FaGithub,
  FaGitlab,
  FaLinkedin,
  FaWhatsapp,
  FaCopy,
  FaEnvelope,
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

export default function ContactPro({
  home,
  formOnly,
}: {
  home?: HomeData
  formOnly?: boolean
}) {
  const toast = useToast()
  const panelBg = useColorModeValue('white', 'gray.800')
  const border = useColorModeValue('gray.200', 'gray.700')
  const label = useColorModeValue('gray.600', 'gray.300')
  // const accent = useColorModeValue('blue.600', 'blue.300')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [reason, setReason] = useState<string>('Project Inquiry')
  const [subject, setSubject] = useState('')
  const [message, setMessage] = useState('')
  const [token, setToken] = useState<string | null>(null)
  const [sending, setSending] = useState(false)
  const [valid, setValid] = useState(false)
  // const fileRef = useRef<HTMLInputElement | null>(null)

  // autosave draft
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

  const EmailPhone = useMemo(() => {
    const items: Array<{
      label: string
      value?: string
      onClick?: () => void
      icon?: React.ReactNode
    }> = []
    if (home?.hero?.email)
      items.push({
        label: home.hero.email,
        value: home.hero.email,
        onClick: () => onCopy(home.hero?.email || '', 'Email copied'),
        icon: <FaEnvelope />,
      })
    if (home?.hero?.phone)
      items.push({
        label: home.hero.phone,
        value: home.hero.phone,
        onClick: () => onCopy(home.hero?.phone || '', 'Phone copied'),
        icon: <FaCopy />,
      })
    return items
  }, [home?.hero?.email, home?.hero?.phone])

  return (
    <Flex
      direction={{ base: 'column', md: 'row' }}
      gap={6}
      w="100%"
      maxW="1100px"
    >
      {/* Info Panel (hidden when formOnly) */}
      {!formOnly && (
        <MotionBox
          flex={{ base: 'none', md: '0 0 340px' }}
          bg={panelBg}
          borderWidth="1px"
          borderColor={border}
          borderRadius="lg"
          p={5}
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <VStack align="stretch" spacing={4}>
            <HStack>
              <Avatar
                size="lg"
                name={home?.hero?.brand || 'Contact'}
                src={home?.hero?.avatarUrl || undefined}
              />
              <Box>
                <Heading size="sm">{home?.hero?.brand || 'Contact Me'}</Heading>
                <Text fontSize="sm" color={label}>
                  I usually reply within 24 hours.
                </Text>
              </Box>
            </HStack>
            <Divider />
            <VStack align="stretch" spacing={2}>
              {EmailPhone.map((it, idx) => (
                <HStack key={idx} justify="space-between">
                  <HStack>
                    <Box>{it.icon}</Box>
                    <Text>{it.label}</Text>
                  </HStack>
                  <Tooltip label="Copy">
                    <IconButton
                      aria-label="copy"
                      icon={<FaCopy />}
                      size="sm"
                      onClick={it.onClick}
                    />
                  </Tooltip>
                </HStack>
              ))}
            </VStack>
            <HStack pt={2} spacing={2}>
              {home?.socials?.github && (
                <IconButton
                  aria-label="GitHub"
                  icon={<FaGithub />}
                  onClick={() => window.open(home.socials!.github!, '_blank')}
                />
              )}
              {home?.socials?.gitlab && (
                <IconButton
                  aria-label="GitLab"
                  icon={<FaGitlab />}
                  onClick={() => window.open(home.socials!.gitlab!, '_blank')}
                />
              )}
              {home?.socials?.linkedin && (
                <IconButton
                  aria-label="LinkedIn"
                  icon={<FaLinkedin />}
                  onClick={() => window.open(home.socials!.linkedin!, '_blank')}
                />
              )}
              {home?.socials?.whatsapp && (
                <IconButton
                  aria-label="WhatsApp"
                  colorScheme="whatsapp"
                  icon={<FaWhatsapp />}
                  onClick={() => window.open(home.socials!.whatsapp!, '_blank')}
                />
              )}
            </HStack>
          </VStack>
        </MotionBox>
      )}

      {/* Form Panel */}
      <MotionBox
        flex="1"
        bg={panelBg}
        borderWidth="1px"
        borderColor={border}
        borderRadius="lg"
        p={5}
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <form onSubmit={onSubmit}>
          <VStack spacing={4} align="stretch">
            <HStack
              spacing={4}
              align={{ base: 'stretch', md: 'center' }}
              flexWrap="wrap"
            >
              <FormControl isRequired isInvalid={!name.trim()}>
                <FormLabel>Name</FormLabel>
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Your name"
                />
                {!name.trim() && <FormErrorMessage>Required</FormErrorMessage>}
              </FormControl>
              <FormControl isRequired isInvalid={!/.+@.+\..+/.test(email)}>
                <FormLabel>Email</FormLabel>
                <Input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                />
                {!/.+@.+\..+/.test(email) && (
                  <FormErrorMessage>Invalid email</FormErrorMessage>
                )}
              </FormControl>
            </HStack>

            <HStack
              spacing={4}
              align={{ base: 'stretch', md: 'center' }}
              flexWrap="wrap"
            >
              <FormControl>
                <FormLabel>Reason</FormLabel>
                <Select
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                >
                  {REASONS.map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </Select>
              </FormControl>
              <FormControl isRequired isInvalid={!subject.trim() && !reason}>
                <FormLabel>Subject</FormLabel>
                <Input
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  placeholder="Subject"
                />
                {!subject.trim() && !reason && (
                  <FormErrorMessage>Subject required</FormErrorMessage>
                )}
              </FormControl>
            </HStack>

            <FormControl isRequired isInvalid={!message.trim()}>
              <FormLabel>Message</FormLabel>
              <Textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Tell me a bit more..."
                rows={8}
              />
              <HStack justify="space-between" pt={1}>
                <Text fontSize="xs" color={label}>
                  {chars} / 1000
                </Text>
                <Progress w="180px" size="xs" value={pct} colorScheme="blue" />
              </HStack>
              {!message.trim() && <FormErrorMessage>Required</FormErrorMessage>}
            </FormControl>

            <Captcha
              updateToken={setToken}
              shouldReset={false}
              updateReset={() => {}}
            />

            <HStack justify="space-between" flexWrap="wrap" gap={2}>
              <HStack>
                <Button
                  type="submit"
                  colorScheme="blue"
                  isDisabled={!valid}
                  isLoading={sending}
                >
                  Send Message
                </Button>
                <Button variant="outline" onClick={clearDraft}>
                  Clear
                </Button>
              </HStack>
              <Button
                variant="ghost"
                onClick={() => {
                  const fullSubject = encodeURIComponent(subject || reason)
                  const body = encodeURIComponent(
                    `Reason: ${reason}\n\n${message}`
                  )
                  window.location.href = `mailto:${
                    home?.hero?.email || ''
                  }?subject=${fullSubject}&body=${body}`
                }}
              >
                Use Mail App
              </Button>
            </HStack>
          </VStack>
        </form>
      </MotionBox>
    </Flex>
  )
}
