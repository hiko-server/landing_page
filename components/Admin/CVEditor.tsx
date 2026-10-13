import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  AlertDialog,
  AlertDialogBody,
  AlertDialogContent,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogOverlay,
  Box,
  Button,
  Flex,
  HStack,
  Spinner,
  Tab,
  TabList,
  TabPanel,
  TabPanels,
  Tabs,
  Text,
  Textarea,
  VisuallyHidden,
  useDisclosure,
  useToast,
} from '@chakra-ui/react'
import { useAdminDirty, useDirtyRegistration } from './AdminDirtyContext'
import { LOGIN_HREF, readAdminCv, saveCv } from './cvStudio/cvApi'
import { validateCvDoc, type CvValidationError } from '../../lib/cvValidate'
import { monoFont, useStudioTokens } from './cvStudio/fields'

/**
 * Raw JSON editor for the CV ({ en: Section[], zh: Section[] }).
 *
 * Power-user escape hatch next to the Studio. Parsing is strict JSON with
 * only two forgiving fixes (BOM, trailing commas) — text inside strings is
 * never rewritten, so curly quotes in prose survive a save.
 * Version history / restore lives in the dashboard's Versions tab.
 *
 * Loads the FULL document from the admin-only endpoint (a public / pruned
 * copy is refused, never shown) and saves conditionally on the loaded
 * version, so a newer save from the Studio is never overwritten silently.
 */

type ParseResult = { ok: true; value: any[] } | { ok: false; error: string }

function parseSections(text: string): ParseResult {
  const src = text.replace(/^﻿/, '')
  const tryParse = (s: string) => JSON.parse(s)
  let value: any
  try {
    value = tryParse(src)
  } catch (first: any) {
    try {
      // Only structural leniency: trailing commas before } or ].
      value = tryParse(src.replace(/,(\s*[}\]])/g, '$1'))
    } catch {
      const m = String(first?.message || '').match(/position (\d+)/)
      if (m) {
        const pos = Number(m[1])
        const before = src.slice(0, pos)
        const line = before.split('\n').length
        const col = pos - before.lastIndexOf('\n')
        return { ok: false, error: `Invalid JSON at line ${line}, column ${col}` }
      }
      return { ok: false, error: first?.message || 'Invalid JSON' }
    }
  }
  if (!Array.isArray(value)) return { ok: false, error: 'Root must be an array of sections' }
  const bad = value.findIndex((s) => !s || typeof s !== 'object' || typeof s.sessionName !== 'string')
  if (bad >= 0) return { ok: false, error: `Section #${bad + 1} needs a string "sessionName"` }
  return { ok: true, value }
}

const pretty = (v: unknown) => JSON.stringify(Array.isArray(v) ? v : [], null, 2)

type LoadState = 'loading' | 'ready' | 'error' | 'unauthorized'

export default function CVEditor() {
  const toast = useToast()
  const { confirmDiscard } = useAdminDirty()
  const [enText, setEnText] = useState('')
  const [zhText, setZhText] = useState('')
  const [baseline, setBaseline] = useState({ en: '', zh: '' })
  const [loadState, setLoadState] = useState<LoadState>('loading')
  const [loadError, setLoadError] = useState('')
  const [saving, setSaving] = useState(false)
  const [sessionExpired, setSessionExpired] = useState(false)
  // ETag of the version the text is based on; sent as If-Match on save.
  const etagRef = useRef<string | null>(null)
  const conflict = useDisclosure()
  const cancelRef = useRef<HTMLButtonElement | null>(null)
  const fileRef = useRef<HTMLInputElement | null>(null)
  const tabLeaves = useRef(false)
  const [invalid, setInvalid] = useState<CvValidationError[]>([])
  const { border, dim, inputBg: editorBg } = useStudioTokens()

  const load = useCallback(async () => {
    setLoadState('loading')
    setLoadError('')
    const r = await readAdminCv()
    if (r.kind === 'unauthorized') {
      setLoadState('unauthorized')
      return
    }
    if (r.kind === 'error') {
      setLoadError(r.error)
      setLoadState('error')
      return
    }
    const en = pretty(r.doc.en)
    const zh = pretty(r.doc.zh)
    etagRef.current = r.etag
    setEnText(en)
    setZhText(zh)
    setBaseline({ en, zh })
    setSessionExpired(false)
    setLoadState('ready')
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const enParsed = useMemo(() => parseSections(enText), [enText])
  const zhParsed = useMemo(() => parseSections(zhText), [zhText])
  const dirty = loadState === 'ready' && (enText !== baseline.en || zhText !== baseline.zh)
  const valid = enParsed.ok && zhParsed.ok

  /**
   * Save; without `force` the write is conditional on the loaded version
   * (If-Match). Resolves true only when the server stored the document.
   */
  const save = async (force = false): Promise<boolean> => {
    if (!enParsed.ok || !zhParsed.ok || saving) return false
    const checked = validateCvDoc({ en: enParsed.value, zh: zhParsed.value })
    if (!checked.ok) {
      setInvalid(checked.errors)
      return false
    }
    setSaving(true)
    try {
      const r = await saveCv({ en: enParsed.value, zh: zhParsed.value }, force ? null : etagRef.current)
      if (r.kind === 'conflict') {
        conflict.onOpen()
        return false
      }
      conflict.onClose()
      if (r.kind === 'unauthorized') {
        setSessionExpired(true)
        return false
      }
      if (r.kind === 'invalid') {
        setInvalid(r.errors)
        return false
      }
      if (r.kind === 'error') {
        toast({ status: 'error', title: 'Save failed', description: r.error, isClosable: true })
        return false
      }
      etagRef.current = r.etag
      const en = pretty(enParsed.value)
      const zh = pretty(zhParsed.value)
      setEnText(en)
      setZhText(zh)
      setBaseline({ en, zh })
      setSessionExpired(false)
      setInvalid([])
      toast({ status: r.warning ? 'warning' : 'success', title: 'Saved', description: r.warning })
      return true
    } finally {
      setSaving(false)
    }
  }
  useDirtyRegistration('cv-raw', dirty, () => save(false))

  const format = () => {
    if (enParsed.ok) setEnText(pretty(enParsed.value))
    if (zhParsed.ok) setZhText(pretty(zhParsed.value))
  }

  const onUpload = async (file: File) => {
    try {
      const json = JSON.parse((await file.text()).replace(/^﻿/, ''))
      if (Array.isArray(json)) setEnText(pretty(json))
      else if (json && (Array.isArray(json.en) || Array.isArray(json.zh))) {
        if (Array.isArray(json.en)) setEnText(pretty(json.en))
        if (Array.isArray(json.zh)) setZhText(pretty(json.zh))
      } else throw new Error('Expected { en, zh } or an array')
      toast({ status: 'info', title: `Loaded ${file.name}`, description: 'Review, then Save to publish.' })
    } catch (e: any) {
      toast({ status: 'error', title: 'Invalid JSON file', description: e?.message })
    }
  }

  if (loadState === 'loading') {
    return (
      <Flex h="40vh" align="center" justify="center" role="status">
        <Spinner color="var(--accent)" />
        <VisuallyHidden>Loading CV JSON</VisuallyHidden>
      </Flex>
    )
  }
  if (loadState === 'unauthorized' || loadState === 'error') {
    const expired = loadState === 'unauthorized'
    return (
      <Flex h="40vh" align="center" justify="center" direction="column" gap={3} textAlign="center" px={6} role="alert">
        <Text fontWeight={600}>{expired ? 'Session expired — sign in again' : 'Could not load the CV'}</Text>
        <Text fontSize="13px" color={dim} maxW="440px">
          {expired ? 'The JSON editor only opens the full CV for a signed-in admin, so nothing was loaded.' : loadError}
        </Text>
        {expired ? (
          <Button size="sm" as="a" href={LOGIN_HREF} bg="var(--accent)" color="white" _hover={{ opacity: 0.92 }}>
            Sign in again
          </Button>
        ) : (
          <Button size="sm" onClick={load}>
            Retry
          </Button>
        )}
      </Flex>
    )
  }

  const editor = (value: string, onChange: (v: string) => void, parsed: ParseResult, label: string) => (
    <Box>
      <Textarea
        aria-label={`${label} CV JSON`}
        fontFamily={monoFont}
        fontSize="12px"
        lineHeight="1.6"
        minH="62vh"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        spellCheck={false}
        bg={editorBg}
        borderColor={parsed.ok ? border : 'red.400'}
        focusBorderColor={parsed.ok ? 'var(--accent)' : 'red.400'}
        sx={{ tabSize: 2 }}
        onKeyDown={(e) => {
          // Tab indents; Esc first lets the next Tab leave the editor (no keyboard trap).
          if (e.key === 'Escape') {
            tabLeaves.current = true
            return
          }
          if (e.key === 'Tab' && (tabLeaves.current || e.shiftKey)) {
            tabLeaves.current = false
            return
          }
          tabLeaves.current = false
          if (e.key === 'Tab') {
            e.preventDefault()
            const el = e.currentTarget
            const { selectionStart: a, selectionEnd: b } = el
            const next = value.slice(0, a) + '  ' + value.slice(b)
            onChange(next)
            requestAnimationFrame(() => el.setSelectionRange(a + 2, a + 2))
          }
        }}
      />
      <Flex mt={1.5} gap={3} justify="space-between" wrap="wrap" fontFamily={monoFont} fontSize="11px">
        <Text color={parsed.ok ? dim : 'red.400'} aria-live="polite">
          {parsed.ok ? `✓ valid · ${parsed.value.length} section(s)` : parsed.error}
        </Text>
        <Text color={dim}>Tab indents · Esc then Tab leaves the editor</Text>
      </Flex>
    </Box>
  )

  return (
    <Flex direction="column" gap={3}>
      <Flex align="center" gap={2} wrap="wrap">
        <Button
          size="sm"
          onClick={() => void save(false)}
          isLoading={saving}
          isDisabled={!dirty || !valid}
          bg={dirty && valid ? 'var(--accent)' : undefined}
          color={dirty && valid ? 'white' : undefined}
          _hover={dirty && valid ? { opacity: 0.92 } : undefined}
        >
          Save
        </Button>
        <Button size="sm" variant="outline" onClick={format} isDisabled={!enParsed.ok && !zhParsed.ok}>
          Format
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={async () => {
            const ok = await confirmDiscard('Discard your JSON edits and reload from the server?', {
              title: 'Reload the CV JSON?',
              allowSave: false,
              discardLabel: 'Discard and reload',
            })
            if (ok) load()
          }}
        >
          Reload
        </Button>
        <Button size="sm" variant="ghost" as="a" href="/api/cvdata?download=current">
          Download
        </Button>
        <Button size="sm" variant="ghost" onClick={() => fileRef.current?.click()}>
          Load file…
        </Button>
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          hidden
          aria-hidden
          tabIndex={-1}
          onChange={(e) => {
            const f = e.target.files?.[0]
            if (f) onUpload(f)
            e.target.value = ''
          }}
        />
        <HStack ml="auto" spacing={1.5} fontFamily={monoFont} fontSize="11px" color={dim} role="status" aria-live="polite">
          <Box w="7px" h="7px" borderRadius="full" bg={dirty ? 'orange.400' : 'green.400'} aria-hidden />
          <Text>{dirty ? 'unsaved' : 'in sync with server'}</Text>
        </HStack>
      </Flex>
      {sessionExpired ? (
        <Flex align="center" gap={3} px={3} py={2} borderRadius="md" bg="rgba(239,68,68,0.10)" wrap="wrap" fontSize="13px" role="alert">
          <Text flex={1} minW="200px">
            Session expired — sign in again. Nothing was saved; copy your JSON somewhere safe before leaving this page.
          </Text>
          <Button size="xs" as="a" href={LOGIN_HREF} target="_blank" rel="noopener" bg="var(--accent)" color="white" _hover={{ opacity: 0.9 }}>
            Sign in again
          </Button>
        </Flex>
      ) : null}
      {invalid.length ? (
        <Box px={3} py={2} borderRadius="md" bg="rgba(239,68,68,0.08)" fontSize="13px" role="alert">
          <Text fontWeight={600}>
            Not saved: {invalid.length === 1 ? 'one value needs fixing' : `${invalid.length}${invalid.length >= 50 ? '+' : ''} values need fixing`}
          </Text>
          <Box as="ul" mt={1} pl={4}>
            {invalid.slice(0, 5).map((e) => (
              <Box as="li" key={`${e.path.join('.')}-${e.message}`} mt={0.5}>
                <Text as="span" fontFamily={monoFont} fontSize="12px">
                  {e.path[0]}[{e.path.slice(1).join('][')}]
                </Text>{' '}
                — {e.message}
              </Box>
            ))}
          </Box>
          {invalid.length > 5 ? (
            <Text mt={1} fontSize="12px" color={dim}>
              …and {invalid.length - 5} more.
            </Text>
          ) : null}
        </Box>
      ) : null}
      <Text fontSize="12px" color={dim}>
        Visibility keys: <code>isVisible</code> (section on CV / entry shown), <code>showOnWebsite</code>,{' '}
        <code>hiddenFields: [&quot;gpa&quot;]</code>, <code>hiddenItems: {'{'} &quot;points&quot;: [0] {'}'}</code>. The
        Studio edits these for you.
      </Text>
      <Tabs variant="enclosed" size="sm">
        <TabList>
          <Tab>
            English {enParsed.ok ? '' : '⚠'}
          </Tab>
          <Tab>
            中文 {zhParsed.ok ? '' : '⚠'}
          </Tab>
        </TabList>
        <TabPanels>
          <TabPanel px={0}>{editor(enText, setEnText, enParsed, 'English')}</TabPanel>
          <TabPanel px={0}>{editor(zhText, setZhText, zhParsed, 'Chinese')}</TabPanel>
        </TabPanels>
      </Tabs>

      <AlertDialog isOpen={conflict.isOpen} onClose={conflict.onClose} leastDestructiveRef={cancelRef} isCentered>
        <AlertDialogOverlay>
          <AlertDialogContent mx={4}>
            <AlertDialogHeader fontSize="md">The CV changed somewhere else</AlertDialogHeader>
            <AlertDialogBody fontSize="sm">
              It was saved from the Studio, another tab or device after this JSON was loaded, so nothing was saved. Reload the
              latest copy (your JSON edits here will be lost), or overwrite it with your version.
            </AlertDialogBody>
            <AlertDialogFooter gap={2} flexWrap="wrap">
              <Button ref={cancelRef} size="sm" variant="ghost" onClick={conflict.onClose}>
                Cancel
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  conflict.onClose()
                  load()
                }}
              >
                Reload latest
              </Button>
              <Button size="sm" colorScheme="red" onClick={() => void save(true)} isLoading={saving}>
                Overwrite
              </Button>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialogOverlay>
      </AlertDialog>
    </Flex>
  )
}
