import React, { useEffect, useMemo, useState } from 'react'
import {
  Alert,
  AlertDescription,
  AlertIcon,
  AlertTitle,
  Avatar,
  Badge,
  Box,
  Button,
  Divider,
  Flex,
  FormControl,
  FormErrorMessage,
  FormHelperText,
  FormLabel,
  Heading,
  HStack,
  IconButton,
  Input,
  Progress,
  Select,
  Stack,
  Text,
  Textarea,
  Tooltip,
  VStack,
  useColorModeValue,
  useToast,
} from '@chakra-ui/react'
import { motion } from 'framer-motion'
import {
  FaCopy,
  FaEnvelope,
  FaGithub,
  FaGitlab,
  FaLinkedin,
  FaWhatsapp,
} from 'react-icons/fa'
import { FiClock, FiMail, FiShield } from 'react-icons/fi'
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

type SubmitBanner = {
  status: 'success' | 'error'
  title: string
  description: string
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

const formatSavedTime = (value: string) => {
  try {
    return new Date(value).toLocaleTimeString([], {
      hour: 'numeric',
      minute: '2-digit',
    })
  } catch {
    return ''
  }
}

export default function ContactPro({
  home,
  formOnly,
}: {
  home?: HomeData
  formOnly?: boolean
}) {
  const toast = useToast()
  const panelBg = useColorModeValue('whiteAlpha.900', 'blackAlpha.450')
  const cardBg = useColorModeValue('gray.50', 'whiteAlpha.80')
  const border = useColorModeValue('gray.200', 'gray.700')
  const label = useColorModeValue('gray.600', 'gray.300')
  const subtleText = useColorModeValue('gray.500', 'gray.400')
  const draftBadgeScheme = useColorModeValue('green', 'teal')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [reason, setReason] = useState<string>('Project Inquiry')
  const [subject, setSubject] = useState('')
  const [message, setMessage] = useState('')
  const [token, setToken] = useState<string | null>(null)
  const [sending, setSending] = useState(false)
  const [draftReady, setDraftReady] = useState(false)
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null)
  const [shouldResetCaptcha, setShouldResetCaptcha] = useState(false)
  const [submitBanner, setSubmitBanner] = useState<SubmitBanner | null>(null)

  const emailValid = /.+@.+\..+/.test(email)
  const nameValid = name.trim().length > 0
  const messageValid = message.trim().length > 0
  const isValid = nameValid && emailValid && messageValid && Boolean(token)

  const chars = message.length
  const pct = Math.min(100, Math.floor((chars / 1000) * 100))
  const hasDraftContent = useMemo(
    () =>
      [name, email, subject, message].some((value) => value.trim().length > 0) ||
      reason !== 'Project Inquiry',
    [email, message, name, reason, subject]
  )

  useEffect(() => {
    try {
      const raw = localStorage.getItem('contact_draft')
      if (raw) {
        const draft = JSON.parse(raw)
        setName(draft.name || '')
        setEmail(draft.email || '')
        setReason(draft.reason || 'Project Inquiry')
        setSubject(draft.subject || '')
        setMessage(draft.message || '')
        setLastSavedAt(draft.savedAt || null)
      }
    } catch {
      setLastSavedAt(null)
    } finally {
      setDraftReady(true)
    }
  }, [])

  useEffect(() => {
    if (!draftReady) return

    if (!hasDraftContent) {
      try {
        localStorage.removeItem('contact_draft')
      } catch {}
      setLastSavedAt(null)
      return
    }

    const timeoutId = window.setTimeout(() => {
      const savedAt = new Date().toISOString()
      try {
        localStorage.setItem(
          'contact_draft',
          JSON.stringify({ name, email, reason, subject, message, savedAt })
        )
        setLastSavedAt(savedAt)
      } catch {}
    }, 500)

    return () => window.clearTimeout(timeoutId)
  }, [draftReady, email, hasDraftContent, message, name, reason, subject])

  useEffect(() => {
    if (!submitBanner) return
    if (
      [name, email, subject, message].some((value) => value.trim().length > 0) ||
      reason !== 'Project Inquiry' ||
      token
    ) {
      setSubmitBanner(null)
    }
  }, [email, message, name, reason, subject, token, submitBanner])

  const resetForm = ({ preserveBanner = false }: { preserveBanner?: boolean } = {}) => {
    try {
      localStorage.removeItem('contact_draft')
    } catch {}

    setName('')
    setEmail('')
    setReason('Project Inquiry')
    setSubject('')
    setMessage('')
    setToken(null)
    setLastSavedAt(null)
    setShouldResetCaptcha(true)

    if (!preserveBanner) {
      setSubmitBanner(null)
    }
  }

  const onCopy = (value: string, successTitle: string) => {
    navigator.clipboard
      .writeText(value)
      .then(() => toast({ status: 'success', title: successTitle }))
      .catch(() => toast({ status: 'error', title: 'Copy failed' }))
  }

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!isValid || sending) return

    setSending(true)
    setSubmitBanner(null)

    try {
      const fullSubject = subject.trim() || reason
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
        resetForm({ preserveBanner: true })
        setSubmitBanner({
          status: 'success',
          title: 'Message sent',
          description:
            'Thanks for reaching out. Your message was submitted successfully and the local draft has been cleared.',
        })
      } else {
        const data = await res.json().catch(() => ({}))
        setSubmitBanner({
          status: 'error',
          title: 'Could not send your message',
          description: data?.error || 'Please review the form and try again.',
        })
      }
    } catch (error: any) {
      setSubmitBanner({
        status: 'error',
        title: 'Network error',
        description: error?.message || 'Please try again in a moment.',
      })
    } finally {
      setSending(false)
    }
  }

  const directContact: Array<{
    label: string
    value?: string
    onClick?: () => void
    icon: React.ReactNode
  }> = []

  if (home?.hero?.email) {
    directContact.push({
      label: home.hero.email,
      value: home.hero.email,
      onClick: () => onCopy(home.hero?.email || '', 'Email copied'),
      icon: <FaEnvelope />,
    })
  }

  if (home?.hero?.phone) {
    directContact.push({
      label: home.hero.phone,
      value: home.hero.phone,
      onClick: () => onCopy(home.hero?.phone || '', 'Phone copied'),
      icon: <FaCopy />,
    })
  }

  const infoHighlights = [
    {
      icon: FiClock,
      title: 'Fast follow-up',
      description: 'Most serious inquiries get a reply within 24 hours.',
    },
    {
      icon: FiShield,
      title: 'Protected submission',
      description: 'The form is rate-limited and protected with hCaptcha.',
    },
    {
      icon: FiMail,
      title: 'Clear context helps',
      description: 'Sharing your goal, timing, and budget leads to better replies.',
    },
  ]

  return (
    <Flex direction={{ base: 'column', md: 'row' }} gap={6} w="100%" maxW="1120px">
      {!formOnly && (
        <MotionBox
          flex={{ base: 'none', md: '0 0 360px' }}
          bg={panelBg}
          borderWidth="1px"
          borderColor={border}
          borderRadius="2xl"
          p={6}
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          backdropFilter="blur(12px)"
        >
          <VStack align="stretch" spacing={5}>
            <HStack align="flex-start" spacing={4}>
              <Avatar
                size="lg"
                name={home?.hero?.brand || 'Contact'}
                src={home?.hero?.avatarUrl || undefined}
              />
              <Box>
                <Badge colorScheme="teal" mb={2}>
                  Open for inquiries
                </Badge>
                <Heading size="md">{home?.hero?.brand || 'Contact Hiko'}</Heading>
                <Text fontSize="sm" color={label} mt={1}>
                  Use the form for project work, collaboration, hiring, or consulting requests.
                </Text>
              </Box>
            </HStack>

            <Divider />

            <Stack spacing={3}>
              {infoHighlights.map(({ icon: Icon, title, description }) => (
                <Box
                  key={title}
                  borderWidth="1px"
                  borderColor={border}
                  borderRadius="xl"
                  bg={cardBg}
                  p={4}
                >
                  <HStack align="flex-start" spacing={3}>
                    <Box
                      display="flex"
                      alignItems="center"
                      justifyContent="center"
                      boxSize="36px"
                      borderRadius="xl"
                      bg="teal.500"
                      color="white"
                      flexShrink={0}
                    >
                      <Icon />
                    </Box>
                    <Box>
                      <Text fontWeight="semibold">{title}</Text>
                      <Text fontSize="sm" color={label}>
                        {description}
                      </Text>
                    </Box>
                  </HStack>
                </Box>
              ))}
            </Stack>

            {directContact.length > 0 && (
              <>
                <Divider />
                <VStack align="stretch" spacing={3}>
                  <Text fontWeight="semibold">Direct contact</Text>
                  {directContact.map((item) => (
                    <HStack
                      key={item.label}
                      justify="space-between"
                      borderWidth="1px"
                      borderColor={border}
                      borderRadius="xl"
                      bg={cardBg}
                      p={3}
                    >
                      <HStack spacing={3}>
                        <Box>{item.icon}</Box>
                        <Text>{item.label}</Text>
                      </HStack>
                      <Tooltip label="Copy">
                        <IconButton
                          aria-label={`Copy ${item.label}`}
                          icon={<FaCopy />}
                          size="sm"
                          onClick={item.onClick}
                        />
                      </Tooltip>
                    </HStack>
                  ))}
                </VStack>
              </>
            )}

            <Divider />

            <HStack spacing={2} flexWrap="wrap">
              {home?.socials?.github && (
                <IconButton
                  aria-label="GitHub"
                  icon={<FaGithub />}
                  onClick={() => window.open(home.socials?.github, '_blank', 'noopener,noreferrer')}
                />
              )}
              {home?.socials?.gitlab && (
                <IconButton
                  aria-label="GitLab"
                  icon={<FaGitlab />}
                  onClick={() => window.open(home.socials?.gitlab, '_blank', 'noopener,noreferrer')}
                />
              )}
              {home?.socials?.linkedin && (
                <IconButton
                  aria-label="LinkedIn"
                  icon={<FaLinkedin />}
                  onClick={() => window.open(home.socials?.linkedin, '_blank', 'noopener,noreferrer')}
                />
              )}
              {home?.socials?.whatsapp && (
                <IconButton
                  aria-label="WhatsApp"
                  colorScheme="whatsapp"
                  icon={<FaWhatsapp />}
                  onClick={() => window.open(home.socials?.whatsapp, '_blank', 'noopener,noreferrer')}
                />
              )}
            </HStack>
          </VStack>
        </MotionBox>
      )}

      <MotionBox
        flex="1"
        bg={panelBg}
        borderWidth="1px"
        borderColor={border}
        borderRadius="2xl"
        p={6}
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        backdropFilter="blur(12px)"
      >
        <form onSubmit={onSubmit}>
          <VStack spacing={5} align="stretch">
            <Flex
              direction={{ base: 'column', sm: 'row' }}
              justify="space-between"
              align={{ base: 'flex-start', sm: 'center' }}
              gap={3}
            >
              <Box>
                <Heading size="md">Send a message</Heading>
                <Text fontSize="sm" color={label} mt={1}>
                  Share enough context for a useful reply. Subject is optional if your reason
                  already says enough.
                </Text>
              </Box>
              <HStack spacing={2} flexWrap="wrap">
                <Badge colorScheme="purple">hCaptcha protected</Badge>
                {lastSavedAt && (
                  <Badge colorScheme={draftBadgeScheme}>
                    Draft saved at {formatSavedTime(lastSavedAt)}
                  </Badge>
                )}
              </HStack>
            </Flex>

            {submitBanner && (
              <Alert
                status={submitBanner.status}
                borderRadius="xl"
                alignItems="flex-start"
                variant="subtle"
              >
                <AlertIcon mt={1} />
                <Box>
                  <AlertTitle>{submitBanner.title}</AlertTitle>
                  <AlertDescription>{submitBanner.description}</AlertDescription>
                </Box>
              </Alert>
            )}

            <HStack spacing={4} align={{ base: 'stretch', md: 'center' }} flexWrap="wrap">
              <FormControl isRequired isInvalid={!nameValid}>
                <FormLabel>Name</FormLabel>
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Your name"
                />
                {!nameValid && <FormErrorMessage>Please add your name.</FormErrorMessage>}
              </FormControl>

              <FormControl isRequired isInvalid={!emailValid}>
                <FormLabel>Email</FormLabel>
                <Input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                />
                {!emailValid && (
                  <FormErrorMessage>Please enter a valid email address.</FormErrorMessage>
                )}
              </FormControl>
            </HStack>

            <HStack spacing={4} align={{ base: 'stretch', md: 'center' }} flexWrap="wrap">
              <FormControl>
                <FormLabel>Reason</FormLabel>
                <Select value={reason} onChange={(e) => setReason(e.target.value)}>
                  {REASONS.map((entry) => (
                    <option key={entry} value={entry}>
                      {entry}
                    </option>
                  ))}
                </Select>
              </FormControl>

              <FormControl>
                <FormLabel>Subject</FormLabel>
                <Input
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  placeholder="Optional headline for your message"
                />
                <FormHelperText color={subtleText}>
                  If left empty, the selected reason will be used as the subject.
                </FormHelperText>
              </FormControl>
            </HStack>

            <FormControl isRequired isInvalid={!messageValid}>
              <FormLabel>Message</FormLabel>
              <Textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Tell me about your project, timeline, goals, or question..."
                rows={8}
              />
              <HStack justify="space-between" pt={1} align="center">
                <Text fontSize="xs" color={label}>
                  {chars} / 1000
                </Text>
                <Progress w={['120px', '180px']} size="xs" value={pct} colorScheme="blue" />
              </HStack>
              {!messageValid && (
                <FormErrorMessage>Please add a short message.</FormErrorMessage>
              )}
            </FormControl>

            <Box>
              <Captcha
                updateToken={setToken}
                shouldReset={shouldResetCaptcha}
                updateReset={setShouldResetCaptcha}
              />
              <Text fontSize="xs" color={subtleText} mt={2}>
                Complete the captcha before sending your message.
              </Text>
            </Box>

            <Flex
              direction={{ base: 'column', md: 'row' }}
              justify="space-between"
              align={{ base: 'stretch', md: 'center' }}
              gap={3}
            >
              <HStack flexWrap="wrap" gap={2}>
                <Button
                  type="submit"
                  colorScheme="blue"
                  isDisabled={!isValid}
                  isLoading={sending}
                >
                  Send message
                </Button>
                <Button type="button" variant="outline" onClick={() => resetForm()}>
                  Clear draft
                </Button>
              </HStack>

              <Button
                type="button"
                variant="ghost"
                isDisabled={!home?.hero?.email}
                onClick={() => {
                  const fullSubject = encodeURIComponent(subject.trim() || reason)
                  const body = encodeURIComponent(`Reason: ${reason}\n\n${message}`)
                  window.location.href = `mailto:${home?.hero?.email || ''}?subject=${fullSubject}&body=${body}`
                }}
              >
                Use mail app
              </Button>
            </Flex>
          </VStack>
        </form>
      </MotionBox>
    </Flex>
  )
}
