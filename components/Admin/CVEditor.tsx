import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
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
  useColorModeValue,
  useToast,
} from '@chakra-ui/react'

/**
 * Raw JSON editor for the CV ({ en: Section[], zh: Section[] }).
 *
 * Power-user escape hatch next to the Studio. Parsing is strict JSON with
 * only two forgiving fixes (BOM, trailing commas) — text inside strings is
 * never rewritten, so curly quotes in prose survive a save.
 * Version history / restore lives in the dashboard's Versions tab.
 */

const monoFont = 'var(--font-geist-mono), ui-monospace, monospace'

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

export default function CVEditor() {
  const toast = useToast()
  const [enText, setEnText] = useState('')
  const [zhText, setZhText] = useState('')
  const [baseline, setBaseline] = useState({ en: '', zh: '' })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const fileRef = useRef<HTMLInputElement | null>(null)
  const border = useColorModeValue('rgba(0,0,0,0.10)', 'rgba(255,255,255,0.12)')
  const dim = useColorModeValue('gray.600', 'gray.400')
  const editorBg = useColorModeValue('white', 'rgba(255,255,255,0.03)')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/cvdata', { cache: 'no-store' })
      if (!res.ok) throw new Error(`Server responded ${res.status}`)
      const data = await res.json()
      const en = pretty(data.en)
      const zh = pretty(data.zh)
      setEnText(en)
      setZhText(zh)
      setBaseline({ en, zh })
    } catch (e: any) {
      toast({ status: 'error', title: 'Failed to load CV data', description: e?.message })
    } finally {
      setLoading(false)
    }
  }, [toast])

  useEffect(() => {
    load()
  }, [load])

  const enParsed = useMemo(() => parseSections(enText), [enText])
  const zhParsed = useMemo(() => parseSections(zhText), [zhText])
  const dirty = !loading && (enText !== baseline.en || zhText !== baseline.zh)
  const valid = enParsed.ok && zhParsed.ok

  useEffect(() => {
    const onUnload = (e: BeforeUnloadEvent) => {
      if (!dirty) return
      e.preventDefault()
      e.returnValue = ''
    }
    window.addEventListener('beforeunload', onUnload)
    return () => window.removeEventListener('beforeunload', onUnload)
  }, [dirty])

  const save = async () => {
    if (!enParsed.ok || !zhParsed.ok) return
    setSaving(true)
    try {
      const res = await fetch('/api/cvdata', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ en: enParsed.value, zh: zhParsed.value }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data?.error || `Save failed (${res.status})`)
      const en = pretty(enParsed.value)
      const zh = pretty(zhParsed.value)
      setEnText(en)
      setZhText(zh)
      setBaseline({ en, zh })
      toast({ status: data?.r2Warning ? 'warning' : 'success', title: 'Saved', description: data?.r2Warning })
    } catch (e: any) {
      toast({ status: 'error', title: e?.message || 'Save failed' })
    } finally {
      setSaving(false)
    }
  }

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

  if (loading) {
    return (
      <Flex h="40vh" align="center" justify="center">
        <Spinner color="var(--accent)" />
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
      <Text mt={1.5} fontFamily={monoFont} fontSize="11px" color={parsed.ok ? dim : 'red.400'} aria-live="polite">
        {parsed.ok ? `✓ valid · ${parsed.value.length} section(s)` : parsed.error}
      </Text>
    </Box>
  )

  return (
    <Flex direction="column" gap={3}>
      <Flex align="center" gap={2} wrap="wrap">
        <Button
          size="sm"
          onClick={save}
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
          onClick={() => {
            if (!dirty || window.confirm('Discard your JSON edits and reload from the server?')) load()
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
          onChange={(e) => {
            const f = e.target.files?.[0]
            if (f) onUpload(f)
            e.target.value = ''
          }}
        />
        <HStack ml="auto" spacing={1.5} fontFamily={monoFont} fontSize="11px" color={dim}>
          <Box w="7px" h="7px" borderRadius="full" bg={dirty ? 'orange.400' : 'green.400'} />
          <Text>{dirty ? 'unsaved' : 'in sync with server'}</Text>
        </HStack>
      </Flex>
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
    </Flex>
  )
}
