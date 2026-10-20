import { useEffect, useId, useRef, useState } from 'react'
import {
  Box,
  Button,
  Code,
  Flex,
  Modal,
  ModalBody,
  ModalCloseButton,
  ModalContent,
  ModalFooter,
  ModalHeader,
  ModalOverlay,
  Text,
  Textarea,
  Wrap,
  WrapItem,
  useToast,
} from '@chakra-ui/react'
import { inputProps, outlineButtonProps, primaryButtonProps } from '../shell/ui'
import { readJsonObject } from '../shell/http'
import { NETWORK_ERROR } from '../shell/authMessages'
import { BUILTIN_TEMPLATES, type ReplyLang } from '../../../lib/inboxReply'

/**
 * The owner's reply templates (English and 中文), edited in a dialog from the
 * composer. Saved through POST /api/admin/inbox { action: 'template' } into
 * the content store; a blank template falls back to the built-in greeting +
 * sign-off. Placeholders are inserted at the caret.
 */

const MAX = 4000
const PLACEHOLDERS: Array<{ token: string; label: string }> = [
  { token: '{firstName}', label: 'first name' },
  { token: '{name}', label: 'full name' },
  { token: '{subject}', label: 'their subject' },
  { token: '{me}', label: 'your name' },
]

type Props = {
  isOpen: boolean
  onClose: () => void
  templates: { en?: string; zh?: string }
  initialLang: ReplyLang
  onSaved: (templates: { en?: string; zh?: string }) => void
  onSessionExpired: () => void
}

export default function TemplatesDialog({ isOpen, onClose, templates, initialLang, onSaved, onSessionExpired }: Props) {
  const toast = useToast()
  const ids = useId()
  const [lang, setLang] = useState<ReplyLang>(initialLang)
  const [text, setText] = useState<Record<ReplyLang, string>>({ en: '', zh: '' })
  const [saving, setSaving] = useState(false)
  const areaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    if (!isOpen) return
    setLang(initialLang)
    setText({ en: templates.en ?? BUILTIN_TEMPLATES.en, zh: templates.zh ?? BUILTIN_TEMPLATES.zh })
  }, [isOpen, initialLang, templates])

  const insert = (token: string) => {
    const el = areaRef.current
    const value = text[lang]
    const start = el ? el.selectionStart : value.length
    const end = el ? el.selectionEnd : value.length
    const next = value.slice(0, start) + token + value.slice(end)
    setText((t) => ({ ...t, [lang]: next.slice(0, MAX) }))
    requestAnimationFrame(() => {
      el?.focus()
      el?.setSelectionRange(start + token.length, start + token.length)
    })
  }

  const save = async () => {
    setSaving(true)
    try {
      let saved: { en?: string; zh?: string } = templates
      for (const l of ['en', 'zh'] as const) {
        const value = text[l]
        // Unchanged built-in text is stored as "no template" (follows future defaults).
        const stored = value.trim() === BUILTIN_TEMPLATES[l].trim() ? '' : value
        if ((templates[l] ?? '') === stored) continue
        const res = await fetch('/api/admin/inbox', {
          method: 'POST',
          credentials: 'same-origin',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'template', lang: l, text: stored }),
        })
        if (res.status === 401 || res.status === 403) {
          onSessionExpired()
          return
        }
        const data = await readJsonObject(res)
        if (!res.ok) throw new Error(typeof data.error === 'string' ? data.error : `HTTP ${res.status}`)
        saved = (data.templates as { en?: string; zh?: string }) || {}
      }
      onSaved(saved)
      toast({ status: 'success', title: 'Templates saved', position: 'bottom-right' })
      onClose()
    } catch (e) {
      toast({
        status: 'error',
        title: 'Templates not saved',
        description: e instanceof Error && e.message !== 'Failed to fetch' ? e.message : NETWORK_ERROR,
        position: 'bottom-right',
      })
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} size="xl" isCentered scrollBehavior="inside">
      <ModalOverlay />
      <ModalContent bg="page.bg-elevated" border="1px solid" borderColor="page.border" mx={4}>
        <ModalHeader fontSize="md" pb={1}>
          Reply templates
        </ModalHeader>
        <ModalCloseButton />
        <ModalBody>
          <Text fontSize="sm" color="page.fg-secondary" mb={3}>
            The start of every reply in that language; the original message is quoted below it. Leave the built-in text to keep the
            default greeting and sign-off.
          </Text>
          <Flex role="group" aria-label="Template language" gap={1} mb={3}>
            {(['en', 'zh'] as const).map((l) => (
              <Button
                key={l}
                size="sm"
                {...outlineButtonProps}
                aria-pressed={lang === l}
                bg={lang === l ? 'page.bg-overlay' : 'transparent'}
                fontWeight={lang === l ? 600 : 400}
                onClick={() => setLang(l)}
                lang={l === 'zh' ? 'zh-CN' : 'en'}
              >
                {l === 'zh' ? '中文' : 'English'}
              </Button>
            ))}
          </Flex>
          <Text as="label" htmlFor={`${ids}-text`} display="block" fontSize="xs" color="page.fg-secondary" mb={1}>
            {lang === 'zh' ? '中文 template' : 'English template'}
          </Text>
          <Textarea
            id={`${ids}-text`}
            ref={areaRef}
            {...inputProps}
            value={text[lang]}
            onChange={(e) => setText((t) => ({ ...t, [lang]: e.target.value.slice(0, MAX) }))}
            rows={9}
            fontSize="sm"
            lineHeight="1.6"
            lang={lang === 'zh' ? 'zh-CN' : 'en'}
            aria-describedby={`${ids}-placeholders`}
          />
          <Box id={`${ids}-placeholders`} mt={3}>
            <Text fontSize="xs" color="page.fg-secondary" mb={1.5}>
              Insert a placeholder:
            </Text>
            <Wrap spacing={1.5}>
              {PLACEHOLDERS.map((p) => (
                <WrapItem key={p.token}>
                  <Button size="xs" {...outlineButtonProps} onClick={() => insert(p.token)} aria-label={`Insert ${p.token}, ${p.label}`}>
                    <Code fontSize="xs" bg="transparent" p={0}>
                      {p.token}
                    </Code>
                    <Text as="span" ml={1.5} color="page.fg-secondary" fontWeight={400}>
                      {p.label}
                    </Text>
                  </Button>
                </WrapItem>
              ))}
            </Wrap>
          </Box>
        </ModalBody>
        <ModalFooter gap={2}>
          <Button size="sm" variant="ghost" mr="auto" onClick={() => setText((t) => ({ ...t, [lang]: BUILTIN_TEMPLATES[lang] }))}>
            Reset to built-in
          </Button>
          <Button size="sm" {...outlineButtonProps} onClick={onClose}>
            Cancel
          </Button>
          <Button size="sm" {...primaryButtonProps} onClick={() => void save()} isLoading={saving} loadingText="Saving">
            Save templates
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  )
}
