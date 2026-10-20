import { useEffect, useId, useMemo, useRef, useState } from 'react'
import {
  Alert,
  AlertDescription,
  AlertIcon,
  Box,
  Button,
  ButtonGroup,
  Checkbox,
  Code,
  Flex,
  HStack,
  Input,
  Kbd,
  Link,
  Text,
  Textarea,
  useClipboard,
  useToast,
} from '@chakra-ui/react'
import { FaPaperPlane, FaRegEnvelope, FaCopy } from 'react-icons/fa'
import { MONO, inputProps, outlineButtonProps, primaryButtonProps, useIsMac, warnTextProps } from '../shell/ui'
import { readJsonObject } from '../shell/http'
import { NETWORK_ERROR } from '../shell/authMessages'
import { REPLY_BODY_MAX, REPLY_SUBJECT_MAX, caretAfterGreeting, detectReplyLang, draftReply, replySubject, type ReplyLang } from '../../../lib/inboxReply'
import { mailtoHref, type InboxMessage } from './inboxView'

/**
 * Reply composer of the admin Inbox (inline, under the open message).
 *
 * With SMTP on the server the reply is sent from here (POST
 * /api/admin/inbox/reply): FROM the SMTP account's own address — the one
 * its provider signs, so it passes the recipient's DMARC check — with
 * Reply-To the owner's public address, threaded with the notification
 * e-mail (In-Reply-To / References). Without SMTP it explains how to set it
 * up and offers the same draft through the owner's own mail app (mailto:),
 * then "Mark as replied".
 *
 * The draft starts from the owner's template for the message's language
 * (Chinese text → 中文) or the built-in greeting + sign-off, with the
 * original quoted below. ⌘↵ / Ctrl+↵ sends.
 */

export type ReplyIdentity = {
  smtp: boolean
  smtpHost: string | null
  from: string | null
  fromSource: 'REPLY_FROM_EMAIL' | 'SMTP_USER' | 'FROM_EMAIL' | null
  replyTo: string | null
  ownerName: { en: string; zh: string }
  alignment: { status: string; message: string } | null
  templates: { en?: string; zh?: string }
}

export type ComposerDraft = { lang: ReplyLang; subject: string; body: string; copy: boolean; drafted: string }

type Props = {
  message: InboxMessage
  identity: ReplyIdentity | null
  identityError: string
  /** A draft kept from earlier (switching messages keeps unsent replies). */
  initial?: ComposerDraft | null
  onDraftChange: (draft: ComposerDraft | null) => void
  onSent: (message: InboxMessage | null) => void
  onMarkReplied: () => void
  onClose: () => void
  onEditTemplates: () => void
  onSessionExpired: () => void
  /** Load the sending settings again (after identityError). */
  onRetryIdentity: () => void
}

const COPY_PREF_KEY = 'admin:inbox:bcc-me'

function readCopyPref(): boolean {
  try {
    return window.localStorage.getItem(COPY_PREF_KEY) !== 'off'
  } catch {
    return true
  }
}

function writeCopyPref(on: boolean) {
  try {
    if (on) window.localStorage.removeItem(COPY_PREF_KEY)
    else window.localStorage.setItem(COPY_PREF_KEY, 'off')
  } catch {
    /* storage blocked: the choice lasts for this reply */
  }
}

function freshDraft(message: InboxMessage, identity: ReplyIdentity | null, lang: ReplyLang): { subject: string; body: string } {
  const me = (lang === 'zh' ? identity?.ownerName.zh : identity?.ownerName.en) || identity?.ownerName.en || ''
  const body = draftReply(message, { lang, template: identity?.templates?.[lang], me })
  return { subject: replySubject(message.subject, lang), body }
}

const SOURCE_NOTE: Record<NonNullable<ReplyIdentity['fromSource']>, string> = {
  SMTP_USER: 'the SMTP account’s own address',
  REPLY_FROM_EMAIL: 'REPLY_FROM_EMAIL',
  FROM_EMAIL: 'FROM_EMAIL',
}

export default function ReplyComposer(props: Props) {
  const { message, identity, identityError, initial, onDraftChange, onSent, onMarkReplied, onClose, onEditTemplates, onSessionExpired, onRetryIdentity } = props
  const toast = useToast()
  const isMac = useIsMac()
  const ids = useId()
  const bodyRef = useRef<HTMLTextAreaElement>(null)
  const [lang, setLang] = useState<ReplyLang>(() => initial?.lang ?? detectReplyLang(`${message.subject}\n${message.message}`))
  const [subject, setSubject] = useState(() => initial?.subject ?? replySubject(message.subject, lang))
  const [body, setBody] = useState(() => initial?.body ?? '')
  const [drafted, setDrafted] = useState(() => initial?.drafted ?? '')
  const [copy, setCopy] = useState(() => initial?.copy ?? true)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')
  const { onCopy, hasCopied, setValue } = useClipboard('')

  // First draft once the identity (templates, names) is known — or with the
  // built-in template when it could not be loaded, so writing can start.
  useEffect(() => {
    if (initial || drafted || (!identity && !identityError)) return
    const d = freshDraft(message, identity, lang)
    setSubject(d.subject)
    setBody(d.body)
    setDrafted(d.body)
    setCopy(readCopyPref())
    requestAnimationFrame(() => {
      const el = bodyRef.current
      if (!el) return
      el.focus()
      const at = caretAfterGreeting(d.body)
      el.setSelectionRange(at, at)
    })
    // Drafted once per message; later identity reloads keep the text.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [identity, identityError])

  const edited = !!body && body !== drafted
  useEffect(() => {
    onDraftChange(body ? { lang, subject, body, copy, drafted } : null)
  }, [lang, subject, body, copy, drafted, onDraftChange])
  useEffect(() => setValue(body), [body, setValue])

  const switchLang = (next: ReplyLang) => {
    if (next === lang) return
    setLang(next)
    if (!edited && identity) {
      const d = freshDraft(message, identity, next)
      setSubject(d.subject)
      setBody(d.body)
      setDrafted(d.body)
    }
  }

  const restartFromTemplate = () => {
    if (!identity) return
    const d = freshDraft(message, identity, lang)
    setSubject(d.subject)
    setBody(d.body)
    setDrafted(d.body)
  }

  const smtp = identity?.smtp === true && !!identity.from
  const tooLong = body.length > REPLY_BODY_MAX
  const canSend = smtp && !!subject.trim() && !!body.trim() && !tooLong && !sending

  const send = async () => {
    if (!canSend) return
    setSending(true)
    setError('')
    try {
      const res = await fetch('/api/admin/inbox/reply', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: message.id, subject: subject.trim(), body, lang, copy: copy && !!identity?.replyTo }),
      })
      if (res.status === 401 || res.status === 403) {
        onSessionExpired()
        return
      }
      const data = await readJsonObject(res)
      if (!res.ok) {
        const text = typeof data.error === 'string' && data.error ? data.error : `The reply was not sent (HTTP ${res.status}).`
        setError(text)
        toast({ status: 'error', title: 'Reply not sent', description: text, position: 'bottom-right' })
        return
      }
      toast(
        data.recorded === false
          ? { status: 'warning', title: `Reply sent to ${message.email}`, description: 'It could not be added to the thread here.', position: 'bottom-right' }
          : { status: 'success', title: `Reply sent to ${message.email}`, position: 'bottom-right' },
      )
      onDraftChange(null)
      onSent((data.message as InboxMessage | null) ?? null)
    } catch {
      setError(NETWORK_ERROR)
      toast({ status: 'error', title: 'Reply not sent', description: NETWORK_ERROR, position: 'bottom-right' })
    } finally {
      setSending(false)
    }
  }

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && !e.altKey && !e.shiftKey) {
      e.preventDefault()
      void send()
    } else if (e.key === 'Escape' && !edited) {
      e.preventDefault()
      onClose()
    }
  }

  const mailto = useMemo(() => mailtoHref(message.email, subject.trim() || replySubject(message.subject, lang), body), [message.email, message.subject, subject, body, lang])
  const displayName = (lang === 'zh' ? identity?.ownerName.zh : identity?.ownerName.en) || identity?.ownerName.en || ''

  return (
    <Box
      as="section"
      aria-labelledby={`${ids}-title`}
      border="1px solid"
      borderColor="page.border-strong"
      borderRadius="lg"
      bg="page.bg-elevated"
      overflow="hidden"
      onKeyDown={onKeyDown}
      data-testid="reply-composer"
    >
      <Flex align="center" justify="space-between" gap={3} px={{ base: 3, md: 4 }} py={2.5} borderBottom="1px solid" borderColor="page.border" flexWrap="wrap">
        <Text id={`${ids}-title`} fontSize="sm" fontWeight={600}>
          Reply to {message.name || message.email}
        </Text>
        <ButtonGroup size="xs" isAttached variant="outline" role="group" aria-label="Reply language">
          {(['en', 'zh'] as const).map((l) => (
            <Button
              key={l}
              onClick={() => switchLang(l)}
              aria-pressed={lang === l}
              borderColor="page.border-strong"
              bg={lang === l ? 'page.bg-overlay' : 'transparent'}
              color={lang === l ? 'page.fg' : 'page.fg-secondary'}
              fontWeight={lang === l ? 600 : 400}
              lang={l === 'zh' ? 'zh-CN' : 'en'}
            >
              {l === 'zh' ? '中文' : 'English'}
            </Button>
          ))}
        </ButtonGroup>
      </Flex>

      <Box px={{ base: 3, md: 4 }} pt={3} pb={4}>
        {identityError ? (
          <Alert status="error" variant="left-accent" borderRadius="md" fontSize="sm" mb={3} gap={2} flexWrap="wrap">
            <AlertIcon />
            <AlertDescription flex={1}>Couldn’t load the sending settings ({identityError}).</AlertDescription>
            <Button size="xs" {...outlineButtonProps} onClick={onRetryIdentity}>
              Try again
            </Button>
          </Alert>
        ) : null}

        <Box as="dl" display="grid" gridTemplateColumns="max-content minmax(0, 1fr)" columnGap={3} rowGap={1} fontSize="13px" mb={3}>
          <Text as="dt" color="page.fg-secondary">
            To
          </Text>
          <Text as="dd" m={0} wordBreak="break-all">
            {message.name ? `${message.name} <${message.email}>` : message.email}
          </Text>
          {smtp ? (
            <>
              <Text as="dt" color="page.fg-secondary">
                From
              </Text>
              <Text as="dd" m={0} wordBreak="break-all" data-testid="reply-from">
                {displayName ? `${displayName} <${identity?.from}>` : identity?.from}
                {identity?.fromSource ? (
                  <Text as="span" color="page.fg-secondary">
                    {' '}
                    · {SOURCE_NOTE[identity.fromSource]}
                  </Text>
                ) : null}
              </Text>
              <Text as="dt" color="page.fg-secondary">
                Reply-To
              </Text>
              <Text as="dd" m={0} wordBreak="break-all">
                {identity?.replyTo ? (
                  identity.replyTo
                ) : (
                  <Text as="span" color="page.fg-secondary">
                    none — the visitor answers to the From address (add an e-mail to the Home page’s hero or the CV)
                  </Text>
                )}
              </Text>
            </>
          ) : null}
        </Box>

        {smtp && identity?.alignment?.message ? (
          <Alert status="warning" variant="left-accent" borderRadius="md" fontSize="sm" mb={3} bg="page.bg">
            <AlertIcon />
            <AlertDescription>{identity.alignment.message}</AlertDescription>
          </Alert>
        ) : null}

        <Text as="label" htmlFor={`${ids}-subject`} display="block" fontSize="xs" color="page.fg-secondary" mb={1}>
          Subject
        </Text>
        <Input
          id={`${ids}-subject`}
          {...inputProps}
          size="sm"
          value={subject}
          maxLength={REPLY_SUBJECT_MAX}
          onChange={(e) => setSubject(e.target.value)}
          mb={3}
        />
        <Flex align="baseline" justify="space-between" mb={1} gap={2} flexWrap="wrap">
          <Text as="label" htmlFor={`${ids}-body`} fontSize="xs" color="page.fg-secondary">
            Message
          </Text>
          <HStack spacing={3}>
            {edited && identity ? (
              <Button size="xs" variant="link" color="accent.text" onClick={restartFromTemplate}>
                Start again from the {lang === 'zh' ? '中文' : 'English'} template
              </Button>
            ) : null}
            <Button size="xs" variant="link" color="accent.text" onClick={onEditTemplates}>
              Edit templates
            </Button>
          </HStack>
        </Flex>
        <Textarea
          id={`${ids}-body`}
          ref={bodyRef}
          {...inputProps}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={12}
          resize="vertical"
          fontSize="sm"
          lineHeight="1.6"
          placeholder={identity ? '' : 'Loading the template…'}
          aria-invalid={tooLong || undefined}
          aria-describedby={`${ids}-hint`}
          lang={lang === 'zh' ? 'zh-CN' : 'en'}
        />
        <Text id={`${ids}-hint`} mt={1} fontSize="xs" color={tooLong ? 'red.600' : 'page.fg-secondary'} _dark={tooLong ? { color: 'red.300' } : undefined}>
          Plain text. The quoted original stays below your answer.
          {tooLong ? ` Too long: ${body.length.toLocaleString('en-US')} of ${REPLY_BODY_MAX.toLocaleString('en-US')} characters.` : ''}
        </Text>

        {error ? (
          <Text role="alert" mt={2} fontSize="sm" color="red.600" _dark={{ color: 'red.300' }}>
            {error}
          </Text>
        ) : null}

        {smtp ? (
          <Flex mt={3} gap={3} align="center" justify="space-between" flexWrap="wrap">
            {identity?.replyTo ? (
              <Checkbox
                size="sm"
                isChecked={copy}
                onChange={(e) => {
                  setCopy(e.target.checked)
                  writeCopyPref(e.target.checked)
                }}
                colorScheme="purple"
              >
                <Text as="span" fontSize="sm">
                  Bcc me at {identity.replyTo}
                </Text>
              </Checkbox>
            ) : (
              <Box />
            )}
            <HStack spacing={2}>
              <Button size="sm" variant="ghost" onClick={onClose}>
                {edited ? 'Keep as draft' : 'Cancel'}
              </Button>
              <Button
                size="sm"
                {...primaryButtonProps}
                leftIcon={<FaPaperPlane aria-hidden />}
                onClick={() => void send()}
                isDisabled={!canSend}
                isLoading={sending}
                loadingText="Sending"
                aria-keyshortcuts="Meta+Enter Control+Enter"
              >
                Send
              </Button>
              <Kbd display={{ base: 'none', md: 'inline-block' }} fontSize="10px" fontFamily={MONO} bg="page.bg" borderColor="page.border-strong" color="page.fg-secondary">
                {isMac ? '⌘↵' : 'Ctrl+↵'}
              </Kbd>
            </HStack>
          </Flex>
        ) : identity ? (
          <Box mt={4} border="1px solid" borderColor="page.border" borderRadius="md" p={3} bg="page.bg" data-testid="reply-no-smtp">
            <Text fontSize="sm" fontWeight={600}>
              E-mail sending isn’t set up on this server
            </Text>
            <Text fontSize="sm" color="page.fg-secondary" mt={1}>
              Answer from your own mail app — the draft comes with you — then mark the message replied.
            </Text>
            <Flex mt={3} gap={2} flexWrap="wrap">
              <Button as={Link} href={mailto} size="sm" {...primaryButtonProps} leftIcon={<FaRegEnvelope aria-hidden />} _hover={{ textDecoration: 'none', bg: 'accent.solid-hover' }}>
                Open in mail app
              </Button>
              <Button size="sm" {...outlineButtonProps} leftIcon={<FaCopy aria-hidden />} onClick={onCopy}>
                {hasCopied ? 'Copied' : 'Copy the reply'}
              </Button>
              <Button size="sm" {...outlineButtonProps} onClick={onMarkReplied} isDisabled={message.replied}>
                {message.replied ? 'Marked as replied' : 'Mark as replied'}
              </Button>
              <Button size="sm" variant="ghost" onClick={onClose} ml="auto">
                Close
              </Button>
            </Flex>
            {mailto.length >= 1800 ? (
              <Text fontSize="xs" mt={2} {...warnTextProps}>
                Long replies are shortened in the mail app link — use “Copy the reply” for the full text.
              </Text>
            ) : null}
            <Box as="details" mt={3} fontSize="sm" color="page.fg-secondary" sx={{ '& > summary': { cursor: 'pointer', color: 'page.fg', fontWeight: 500, py: 1, w: 'fit-content' } }}>
              <summary>Send replies from here</summary>
              <Text mt={1.5}>
                Add <Code fontSize="xs">SMTP_HOST</Code>, <Code fontSize="xs">SMTP_PORT</Code>, <Code fontSize="xs">SMTP_USER</Code> and{' '}
                <Code fontSize="xs">SMTP_PASS</Code> to the server’s <Code fontSize="xs">.env</Code> and restart. Replies then go out from the SMTP
                account’s own address — the one your mail provider signs, so recipients’ spam checks (DMARC) pass — with Reply-To set to the
                e-mail your site shows. The dashboard’s “Test email” checks the setup.
              </Text>
            </Box>
          </Box>
        ) : null}
      </Box>
    </Box>
  )
}
