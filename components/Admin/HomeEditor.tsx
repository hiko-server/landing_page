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
  Checkbox,
  Flex,
  FormControl,
  FormLabel,
  HStack,
  Image,
  Input,
  SimpleGrid,
  Spinner,
  Stack,
  Tag,
  TagCloseButton,
  TagLabel,
  Text,
  Textarea,
  Wrap,
  WrapItem,
  useToast,
} from '@chakra-ui/react'
import { AddIcon } from '@chakra-ui/icons'
// Pure shape import — must NOT come from lib/home.ts (server-only, drags
// better-sqlite3 into the client bundle). lib/homeShape.ts has no Node deps.
import { HOME_SECTION_META, type HomeFieldError, type SectionKey } from '../../lib/homeShape'
import { currentlyCodingPlaceholder, mergeCurrentlyCoding } from '../../lib/currentlyCoding'
import { useAdminDirty, useDirtyRegistration } from './AdminDirtyContext'
import { readJsonObject } from './shell/http'
import { useLocalDraft } from './shell/useLocalDraft'
import {
  LoadErrorNotice,
  MONO,
  SaveButton,
  SaveStatus,
  SectionLabel,
  SessionExpiredNotice,
  outlineButtonProps,
  primaryButtonProps,
  useSaveShortcut,
  type SaveState,
} from './shell/ui'
import { formFromHome, normalizeUrl, serializeHome, validateHomeForm, type HomeForm } from './home/homeForm'
import { uploadHomeImage } from './home/imageUpload'
import type { Updater } from './home/ImageCards'
import PhotosSection from './home/PhotosSection'
import BrandsSection from './home/BrandsSection'
import QuickAccessSection from './home/QuickAccessSection'
import AvailabilitySection from './home/AvailabilitySection'
import OpenSourceSection from './home/OpenSourceSection'
import SiteSection from './home/SiteSection'

const DEFAULT_CONTACT_REASONS = ['Project Inquiry', 'Hiring', 'Collaboration', 'Consulting', 'Mentorship', 'Other']

const RETURN_PATH = '/admin/dashboard?tab=home'

type LoadState = 'loading' | 'ready' | 'error' | 'session'

const origin = () => (typeof window !== 'undefined' ? window.location.origin : 'http://localhost')

const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v))

/** A setter for one key of the form that accepts a value or an updater. */
function sliceSetter<K extends keyof HomeForm>(setForm: React.Dispatch<React.SetStateAction<HomeForm>>, key: K): Updater<HomeForm[K]> {
  return (action) =>
    setForm((prev) => ({
      ...prev,
      [key]: typeof action === 'function' ? (action as (p: HomeForm[K]) => HomeForm[K])(prev[key]) : action,
    }))
}

/** Restore a stored draft defensively: anything malformed yields null. */
function draftToForm(value: unknown): HomeForm | null {
  try {
    return formFromHome(serializeHome(value as HomeForm, origin()))
  } catch {
    return null
  }
}

const formatClock = (ms: number) =>
  new Date(ms).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })

export default function HomeEditor({ onUnsavedSource }: { onUnsavedSource?: (get: (() => unknown) | null) => void } = {}) {
  const toast = useToast()
  const { confirmDiscard, clear } = useAdminDirty()
  const [form, setForm] = useState<HomeForm>(() => formFromHome(null))
  const set = useMemo(
    () => ({
      hero: sliceSetter(setForm, 'hero'),
      socials: sliceSetter(setForm, 'socials'),
      brands: sliceSetter(setForm, 'brands'),
      quickAccess: sliceSetter(setForm, 'quickAccess'),
      photos: sliceSetter(setForm, 'photos'),
      sections: sliceSetter(setForm, 'sections'),
      contact: sliceSetter(setForm, 'contact'),
      availability: sliceSetter(setForm, 'availability'),
      openSource: sliceSetter(setForm, 'openSource'),
      site: sliceSetter(setForm, 'site'),
    }),
    [],
  )
  const { hero, socials, contact, sections } = form
  const [newReason, setNewReason] = useState('')
  // CV-derived defaults for the "currently coding" chip, shown as
  // placeholders. Best-effort: stays empty on any fetch error.
  const [ccAuto, setCcAuto] = useState({ label: '', project: '', note: '' })

  // 'ready' only after a successful load of the ADMIN view: saving a form
  // that never loaded (or was filled from the public, pruned view) would
  // PUT an incomplete document over the live home page.
  const [loadState, setLoadState] = useState<LoadState>('loading')
  const [loadError, setLoadError] = useState('')
  const [saving, setSaving] = useState(false)
  const savingRef = useRef(false)
  const [savedAt, setSavedAt] = useState<number | undefined>(undefined)
  const [baseline, setBaseline] = useState<string | null>(null)
  const [reloadKey, setReloadKey] = useState(0)
  // ETag of the version this form is based on (sent as If-Match).
  const etagRef = useRef<string | null>(null)
  const [etag, setEtagState] = useState<string | null>(null)
  const setEtag = useCallback((v: string | null) => {
    etagRef.current = v
    setEtagState(v)
  }, [])
  // Set when a save hit a newer version (409); holds that version's ETag.
  const [conflictEtag, setConflictEtag] = useState<string | null>(null)
  const [conflictMessage, setConflictMessage] = useState('')
  const [sessionExpired, setSessionExpired] = useState(false)
  const [errors, setErrors] = useState<HomeFieldError[]>([])
  const conflictCancelRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    let alive = true
    const load = async () => {
      setLoadState('loading')
      setSessionExpired(false)
      let data: unknown
      let loadedEtag: string | null = null
      try {
        const res = await fetch('/api/admin/home', { cache: 'no-store' })
        if (res.status === 401 || (res.ok && res.headers.get('X-Home-View') !== 'admin')) {
          if (alive) setLoadState('session')
          return
        }
        if (!res.ok) throw new Error(`Server responded ${res.status}`)
        data = await res.json()
        loadedEtag = res.headers.get('ETag')
      } catch (e) {
        if (!alive) return
        const msg = e instanceof Error ? e.message : ''
        setLoadError(msg === 'Failed to fetch' ? 'network error' : msg || 'Failed to load')
        setLoadState('error')
        return
      }
      if (!alive) return
      const loaded = formFromHome(data)
      setForm(loaded)
      setEtag(loadedEtag)
      setBaseline(JSON.stringify(serializeHome(loaded, origin())))
      setErrors([])
      setLoadState('ready')

      try {
        const dr = await fetch('/api/admin/cv-derived', { cache: 'no-store' })
        if (dr.ok && alive) {
          const dj = await readJsonObject(dr)
          if (dj.currentlyCoding) {
            setCcAuto({
              label: dj.currentlyCoding.label || '',
              project: dj.currentlyCoding.project || '',
              note: dj.currentlyCoding.note || '',
            })
          }
        }
      } catch {
        // placeholders just stay generic
      }
    }
    void load()
    return () => {
      alive = false
    }
  }, [reloadKey, setEtag])

  const payload = useMemo(() => serializeHome(form, origin()), [form])
  const snapshot = useMemo(() => JSON.stringify(payload), [payload])
  const dirty = loadState === 'ready' && baseline !== null && snapshot !== baseline

  const localDraft = useLocalDraft<HomeForm>({
    key: 'home',
    value: form,
    baseEtag: etag,
    dirty,
    enabled: loadState === 'ready',
    equals: (a, b) => {
      const restored = draftToForm(a)
      return !!restored && JSON.stringify(serializeHome(restored, origin())) === JSON.stringify(serializeHome(b, origin()))
    },
  })

  // Latest state for "Copy unsaved changes" in the dashboard's error fallback.
  const latest = useRef({ payload, dirty })
  latest.current = { payload, dirty }
  useEffect(() => {
    onUnsavedSource?.(() => (latest.current.dirty ? latest.current.payload : null))
  }, [onUnsavedSource])

  /**
   * PUT the form; resolves true only when the server stored it. `ifMatch` is
   * the version the edit is based on: normally the loaded ETag; after a
   * conflict, "Overwrite" passes the newer version's ETag to replace it.
   */
  const save = useCallback(
    async (ifMatch: string | null): Promise<boolean> => {
      if (loadState !== 'ready' || savingRef.current) return false
      const problems = validateHomeForm(form, origin())
      setErrors(problems)
      if (problems.length) {
        toast({
          status: 'error',
          title: problems.length === 1 ? 'One field needs fixing' : `${problems.length} fields need fixing`,
          description: problems[0].message,
          position: 'bottom-right',
          isClosable: true,
        })
        return false
      }
      const body = serializeHome(form, origin())
      const savedSnapshot = JSON.stringify(body)
      savingRef.current = true
      setSaving(true)
      try {
        const headers: Record<string, string> = { 'Content-Type': 'application/json' }
        if (ifMatch) headers['If-Match'] = ifMatch
        const res = await fetch('/api/home', { method: 'PUT', headers, body: savedSnapshot })
        const json = await readJsonObject(res)
        if (res.ok) {
          const next = (typeof json.etag === 'string' && json.etag) || res.headers.get('ETag')
          if (next) setEtag(next)
          setBaseline(savedSnapshot)
          setSavedAt(Date.now())
          setConflictEtag(null)
          setSessionExpired(false)
          localDraft.clear()
          toast({
            status: json.r2Warning ? 'warning' : 'success',
            title: json.unchanged ? 'Nothing to save — already live' : 'Home saved',
            description: json.r2Warning,
            position: 'bottom-right',
          })
          return true
        }
        if (res.status === 409) {
          setConflictEtag((typeof json.etag === 'string' && json.etag) || res.headers.get('ETag') || '*')
          setConflictMessage(typeof json.message === 'string' ? json.message : '')
          return false
        }
        if (res.status === 422 && Array.isArray(json.errors)) {
          const list = (json.errors as unknown[]).filter(
            (e): e is HomeFieldError => !!e && typeof (e as HomeFieldError).message === 'string' && typeof (e as HomeFieldError).path === 'string',
          )
          setErrors(list)
        }
        if (res.status === 401) setSessionExpired(true)
        toast({
          status: 'error',
          title: 'Save failed',
          description:
            res.status === 401
              ? 'Your session has expired. Sign in again in a new tab, then save — your edits are kept.'
              : res.status === 429
                ? 'Too many saves in a short time — wait a minute and try again.'
                : json.error || `HTTP ${res.status}`,
          position: 'bottom-right',
          duration: 7000,
          isClosable: true,
        })
        return false
      } catch (e) {
        const msg = e instanceof Error ? e.message : ''
        toast({
          status: 'error',
          title: 'Save failed',
          description: msg === 'Failed to fetch' || !msg ? 'Network error — not saved.' : msg,
          position: 'bottom-right',
        })
        return false
      } finally {
        savingRef.current = false
        setSaving(false)
      }
    },
    [loadState, form, toast, setEtag, localDraft],
  )

  useDirtyRegistration('home', dirty, () => save(etagRef.current))

  const canSave = loadState === 'ready' && dirty && !saving
  useSaveShortcut(canSave && !conflictEtag, () => void save(etagRef.current))

  const reloadLatest = useCallback(async () => {
    setConflictEtag(null)
    const ok = await confirmDiscard('Reload the latest saved version? Your unsaved home page edits will be discarded.', {
      title: 'Reload the latest version?',
      allowSave: false,
      discardLabel: 'Discard and reload',
    })
    if (!ok) return
    clear('home')
    setReloadKey((k) => k + 1)
  }, [confirmDiscard, clear])

  const restoreDraft = () => {
    const stale = localDraft.stale
    const draftEtag = localDraft.draft?.etag ?? null
    const restored = draftToForm(localDraft.restore())
    if (!restored) {
      toast({ status: 'error', title: 'That draft could not be read', position: 'bottom-right' })
      localDraft.discard()
      return
    }
    setForm(restored)
    // A draft based on an older version keeps that base, so saving it hits
    // the If-Match check and asks before overwriting the newer copy.
    if (stale) setEtag(draftEtag ?? '"unknown-base"')
  }

  const toggleSection = (key: SectionKey, visible: boolean) => set.sections((prev) => ({ ...prev, [key]: visible }))

  const addReason = () => {
    const v = newReason.trim()
    if (!v) return
    if (contact.reasons.includes(v)) {
      toast({ status: 'info', title: 'Already in the list' })
      return
    }
    set.contact((c) => ({ ...c, reasons: [...c.reasons, v] }))
    setNewReason('')
  }

  const uploadAvatar = async (file: File) => {
    try {
      const { url, warning } = await uploadHomeImage(file)
      set.hero((h) => ({ ...h, avatarUrl: url }))
      toast({ status: warning ? 'warning' : 'success', title: 'Image uploaded', description: warning, position: 'bottom-right' })
    } catch (err) {
      toast({ status: 'error', title: 'Image upload failed', description: err instanceof Error ? err.message : String(err), position: 'bottom-right' })
    }
  }

  // --- Avatar position / scale editor (grid + drag) ---
  const frameRef = useRef<HTMLDivElement | null>(null)
  const dragState = useRef({ startX: 0, startY: 0, startPosX: 50, startPosY: 50, dragging: false })

  const onPointerDown = (e: React.PointerEvent) => {
    if (!frameRef.current) return
    const { x, y } = hero.avatarTransform
    dragState.current = { startX: e.clientX, startY: e.clientY, startPosX: x, startPosY: y, dragging: true }
    ;(e.target as Element).setPointerCapture?.(e.pointerId)
  }
  const onPointerMove = (e: React.PointerEvent) => {
    if (!dragState.current.dragging || !frameRef.current) return
    const rect = frameRef.current.getBoundingClientRect()
    const nx = clamp(dragState.current.startPosX + ((e.clientX - dragState.current.startX) / rect.width) * 100, 0, 100)
    const ny = clamp(dragState.current.startPosY + ((e.clientY - dragState.current.startY) / rect.height) * 100, 0, 100)
    set.hero((h) => ({ ...h, avatarTransform: { ...h.avatarTransform, x: nx, y: ny } }))
  }
  const onPointerUp = (e: React.PointerEvent) => {
    dragState.current.dragging = false
    ;(e.target as Element).releasePointerCapture?.(e.pointerId)
  }
  const setTransform = (change: Partial<HomeForm['hero']['avatarTransform']>) =>
    set.hero((h) => ({ ...h, avatarTransform: { ...h.avatarTransform, ...change } }))

  if (loadState === 'loading') {
    return (
      <Flex h="40vh" align="center" justify="center" role="status" aria-label="Loading the home page content">
        <Spinner color="accent.500" />
      </Flex>
    )
  }
  if (loadState === 'session') return <SessionExpiredNotice returnPath={RETURN_PATH} />
  if (loadState === 'error') {
    return <LoadErrorNotice what="the home page content" error={loadError} onRetry={() => setReloadKey((k) => k + 1)} />
  }

  const saveState: SaveState = saving ? 'saving' : dirty ? 'dirty' : 'clean'
  const heroField = (key: 'welcome' | 'brand' | 'phone' | 'email' | 'avatarUrl', label: string) => (
    <FormControl>
      <FormLabel>{label}</FormLabel>
      <Input value={hero[key]} onChange={(e) => set.hero((h) => ({ ...h, [key]: e.target.value }))} />
    </FormControl>
  )
  const socialField = (key: keyof HomeForm['socials'], label: string) => (
    <FormControl>
      <FormLabel>{label}</FormLabel>
      <Input value={socials[key]} onChange={(e) => set.socials((s) => ({ ...s, [key]: e.target.value }))} />
    </FormControl>
  )
  // Placeholders and the preview follow the visitor-facing merge
  // (lib/currentlyCoding mergeCurrentlyCoding): a typed project replaces the
  // CV chip, so its CV label / note are not offered as "auto" next to it.
  const ccPreview = mergeCurrentlyCoding(hero.currentlyCoding, ccAuto)
  const ccPreviewLines = [ccPreview.label, ccPreview.project, ccPreview.note].filter(Boolean)
  const ccField = (key: 'label' | 'project' | 'note', fallback: string) => (
    <Input
      aria-label={`Currently coding — ${key}`}
      placeholder={currentlyCodingPlaceholder(key, hero.currentlyCoding, ccAuto) ?? fallback}
      value={hero.currentlyCoding[key]}
      onChange={(e) => set.hero((h) => ({ ...h, currentlyCoding: { ...h.currentlyCoding, [key]: e.target.value } }))}
    />
  )

  return (
    <Box maxW="var(--container-content)" mx="auto">
      {localDraft.draft ? (
        <Flex
          align="center"
          gap={3}
          mb={6}
          px={4}
          py={3}
          borderRadius="lg"
          border="1px solid"
          borderColor={localDraft.stale ? 'orange.300' : 'accent.500'}
          bg={localDraft.stale ? 'rgba(251,146,60,0.08)' : 'var(--accent-soft)'}
          flexWrap="wrap"
          role="region"
          aria-label="Unsaved draft"
        >
          <Box flex={1} minW="220px" fontSize="sm">
            <Text>Restore unsaved draft from {formatClock(localDraft.draft.at)}?</Text>
            {localDraft.stale ? (
              <Text fontSize="xs" color="page.fg-secondary" mt={0.5}>
                It is based on an older version of the home page; saving it will ask before replacing the newer one.
              </Text>
            ) : null}
          </Box>
          <Button size="sm" {...primaryButtonProps} onClick={restoreDraft}>
            Restore
          </Button>
          <Button size="sm" variant="ghost" onClick={localDraft.discard}>
            Discard
          </Button>
        </Flex>
      ) : null}

      <SectionLabel index={1} title="Hero" hint="Greeting, name, tagline, avatar and contact details at the top of the home page." />
      <SimpleGrid columns={[1, 2]} gap={4}>
        {heroField('welcome', 'Welcome')}
        {heroField('brand', 'Brand')}
        <FormControl gridColumn="1 / -1">
          <FormLabel>Tagline</FormLabel>
          <Textarea value={hero.tagline} onChange={(e) => set.hero((h) => ({ ...h, tagline: e.target.value }))} />
        </FormControl>
        <FormControl>
          <FormLabel>Avatar URL</FormLabel>
          <Input value={hero.avatarUrl} onChange={(e) => set.hero((h) => ({ ...h, avatarUrl: e.target.value }))} />
          {hero.avatarUrl ? <Image src={normalizeUrl(hero.avatarUrl)} alt="Current avatar" boxSize="60px" objectFit="cover" mt={2} /> : null}
        </FormControl>
        <FormControl>
          <FormLabel>Upload avatar</FormLabel>
          <Input
            type="file"
            accept="image/*"
            onChange={(e) => {
              const input = e.target as HTMLInputElement
              const f = input.files?.[0]
              if (f) void uploadAvatar(f)
              input.value = ''
            }}
          />
        </FormControl>

        <FormControl gridColumn="1 / -1">
          <FormLabel>Avatar position (drag inside the frame) · scale</FormLabel>
          <HStack align="start" spacing={6} flexWrap="wrap">
            <Box>
              <Box
                ref={frameRef}
                position="relative"
                w={['220px', '240px']}
                h={['220px', '240px']}
                borderRadius="full"
                overflow="hidden"
                border="1px solid"
                borderColor="page.border-strong"
                _before={{
                  content: '""',
                  position: 'absolute',
                  inset: 0,
                  backgroundImage:
                    'repeating-linear-gradient(0deg, rgba(255,255,255,0.15) 0, rgba(255,255,255,0.15) 1px, transparent 1px, transparent 20px), repeating-linear-gradient(90deg, rgba(255,255,255,0.15) 0, rgba(255,255,255,0.15) 1px, transparent 1px, transparent 20px)',
                  pointerEvents: 'none',
                }}
                onPointerDown={onPointerDown}
                onPointerMove={onPointerMove}
                onPointerUp={onPointerUp}
                onPointerCancel={onPointerUp}
                cursor="grab"
                sx={{ touchAction: 'none' }}
                bg="black"
              >
                {hero.avatarUrl ? (
                  <Image
                    src={normalizeUrl(hero.avatarUrl)}
                    alt="Avatar position preview"
                    w="100%"
                    h="100%"
                    objectFit="cover"
                    sx={{ objectPosition: `${hero.avatarTransform.x}% ${hero.avatarTransform.y}%` }}
                    transform={`scale(${hero.avatarTransform.scale})`}
                    transformOrigin={`${hero.avatarTransform.x}% ${hero.avatarTransform.y}%`}
                    draggable={false}
                    pointerEvents="none"
                  />
                ) : (
                  <Flex w="full" h="full" align="center" justify="center" color="page.fg-secondary" bg="page.bg-elevated">
                    <Text>No avatar</Text>
                  </Flex>
                )}
              </Box>
              <HStack mt={3} spacing={3}>
                <Button size="sm" {...outlineButtonProps} onClick={() => setTransform({ x: 50, y: 50, scale: 1 })}>
                  Reset
                </Button>
                <Text fontSize="sm" color="page.fg-secondary" className="tnum">
                  X: {Math.round(hero.avatarTransform.x)}% · Y: {Math.round(hero.avatarTransform.y)}% · Scale:{' '}
                  {hero.avatarTransform.scale.toFixed(2)}
                </Text>
              </HStack>
            </Box>
            <Box minW={{ base: '100%', sm: '260px' }}>
              <FormLabel mb={1}>Scale</FormLabel>
              <Input
                type="range"
                min={1}
                max={3}
                step={0.01}
                value={hero.avatarTransform.scale}
                onChange={(e) => setTransform({ scale: Number(e.target.value) })}
                aria-label="Avatar scale"
              />
              <HStack mt={3} spacing={3}>
                <Box>
                  <FormLabel mb={1}>X (%)</FormLabel>
                  <Input
                    type="number"
                    min={0}
                    max={100}
                    step={1}
                    value={Math.round(hero.avatarTransform.x)}
                    onChange={(e) => setTransform({ x: clamp(Number(e.target.value), 0, 100) })}
                    width="100px"
                  />
                </Box>
                <Box>
                  <FormLabel mb={1}>Y (%)</FormLabel>
                  <Input
                    type="number"
                    min={0}
                    max={100}
                    step={1}
                    value={Math.round(hero.avatarTransform.y)}
                    onChange={(e) => setTransform({ y: clamp(Number(e.target.value), 0, 100) })}
                    width="100px"
                  />
                </Box>
              </HStack>
            </Box>
          </HStack>
        </FormControl>

        {heroField('phone', 'Phone')}
        {heroField('email', 'Email')}

        {/*
          "Currently coding" chip: admin > CV > nothing. A typed project
          replaces the CV chip (its label defaults to "currently coding", the
          CV's note is not attached); otherwise blank fields auto-fill from
          the CV's current role or study (organisation, role, label). The
          placeholders and "Visitors see" show the result now.
        */}
        <FormControl gridColumn="1 / -1">
          <FormLabel>
            Currently coding chip
            <Text as="span" color="page.fg-secondary" fontWeight="normal" fontSize="xs" ml={2}>
              shown under avatar on home · blank = auto-fill from CV (a typed project replaces the CV chip)
            </Text>
          </FormLabel>
          <SimpleGrid columns={[1, 3]} gap={3}>
            {ccField('label', 'Top label (e.g. currently coding)')}
            {ccField('project', 'Project line (e.g. WeGreen AI · COT)')}
            {ccField('note', 'Footer note (e.g. self-taught · since 2022)')}
          </SimpleGrid>
          <Text mt={2} fontSize="xs" color="page.fg-secondary" data-testid="cc-preview">
            Visitors see:{' '}
            <Text as="span" color="page.fg" fontFamily={MONO}>
              {ccPreviewLines.length ? ccPreviewLines.join(' · ') : '— (chip hidden)'}
            </Text>
          </Text>
          <Text mt={1} fontSize="xs" color="page.fg-secondary">
            From the CV now:{' '}
            <Text as="span" fontFamily={MONO}>
              {ccAuto.project ? [ccAuto.label, ccAuto.project, ccAuto.note].filter(Boolean).join(' · ') : 'nothing current'}
            </Text>
          </Text>
        </FormControl>
      </SimpleGrid>

      <SectionLabel index={2} title="Socials" hint="Profile URLs for GitHub, GitLab, LinkedIn and WhatsApp." />
      <SimpleGrid columns={[1, 2]} gap={4}>
        {socialField('github', 'GitHub')}
        {socialField('gitlab', 'GitLab')}
        {socialField('linkedin', 'LinkedIn')}
        {socialField('whatsapp', 'WhatsApp')}
      </SimpleGrid>

      <SectionLabel index={3} title="Brands" hint="Affiliation logos, in display order. Drag the handle (or press Space on it and use the arrow keys) to reorder." />
      <BrandsSection value={form.brands} onChange={set.brands} />

      <SectionLabel index={4} title="Quick access" hint="Shortcut links, in display order." />
      <QuickAccessSection value={form.quickAccess} onChange={set.quickAccess} />

      <SectionLabel
        index={5}
        title="Photos"
        hint="Field-notes gallery. The description is the image’s alt text. Switch Visible off to hide a photo without deleting it."
      />
      <PhotosSection value={form.photos} onChange={set.photos} />

      <SectionLabel
        index={6}
        title="Visibility"
        hint="Toggle which rows appear on the home page. Hiding a row also removes its anchor and scroll target; the numbering of the rest stays the same because labels are static."
      />
      <SimpleGrid columns={[1, 2, 3]} gap={3}>
        {HOME_SECTION_META.map(({ key, label, hint }) => {
          const visible = sections[key] !== false
          return (
            <Flex
              key={key}
              as="label"
              align="flex-start"
              gap={3}
              p={3}
              borderWidth="1px"
              borderRadius="md"
              borderColor={visible ? 'accent.500' : 'page.border'}
              bg={visible ? 'var(--accent-soft)' : 'page.bg-elevated'}
              cursor="pointer"
              transition="border-color 180ms var(--ease-out-quart), background-color 180ms var(--ease-out-quart)"
            >
              <Checkbox isChecked={visible} onChange={(e) => toggleSection(key, e.target.checked)} mt={0.5} />
              <Box>
                <Text fontSize="sm" fontWeight={600}>
                  {label}
                </Text>
                <Text fontSize="xs" color="page.fg-secondary" mt={0.5}>
                  {hint}
                </Text>
              </Box>
            </Flex>
          )
        })}
      </SimpleGrid>

      <SectionLabel
        index={7}
        title="Contact panel"
        hint={
          <>
            Heading and reasons dropdown of the home contact section. Leave a field blank to use the built-in default (heading =
            brand name, blurb = &ldquo;I usually reply within 24 hours.&rdquo;, eyebrow = &ldquo;▸ Reach me&rdquo;). Reasons fall back
            to the original six when the list is empty.
          </>
        }
      />
      <SimpleGrid columns={[1, 2]} gap={3}>
        <FormControl>
          <FormLabel>Eyebrow</FormLabel>
          <Input placeholder="▸ Reach me" value={contact.eyebrow} onChange={(e) => set.contact((c) => ({ ...c, eyebrow: e.target.value }))} />
        </FormControl>
        <FormControl>
          <FormLabel>Heading</FormLabel>
          <Input placeholder={hero.brand || 'Contact'} value={contact.heading} onChange={(e) => set.contact((c) => ({ ...c, heading: e.target.value }))} />
        </FormControl>
        <FormControl gridColumn="1 / -1">
          <FormLabel>Blurb</FormLabel>
          <Input placeholder="I usually reply within 24 hours." value={contact.blurb} onChange={(e) => set.contact((c) => ({ ...c, blurb: e.target.value }))} />
        </FormControl>
      </SimpleGrid>
      <Box mt={4}>
        <FormLabel mb={2}>
          Reasons (dropdown)
          <Text as="span" color="page.fg-secondary" fontWeight="normal" fontSize="xs" ml={2}>
            empty list = use defaults
          </Text>
        </FormLabel>
        <Wrap spacing={2} mb={3}>
          {contact.reasons.length === 0 ? (
            <Text fontSize="xs" color="page.fg-secondary" fontStyle="italic">
              No custom reasons — the dropdown will show: <strong>{DEFAULT_CONTACT_REASONS.join(', ')}</strong>
            </Text>
          ) : null}
          {contact.reasons.map((r, idx) => (
            <WrapItem key={`${r}-${idx}`}>
              <Tag size="md" borderRadius="full" variant="outline" color="page.fg" boxShadow="inset 0 0 0 1px var(--chakra-colors-page-border-strong)">
                <TagLabel>{r}</TagLabel>
                <TagCloseButton aria-label={`Remove reason ${r}`} onClick={() => set.contact((c) => ({ ...c, reasons: c.reasons.filter((_, i) => i !== idx) }))} />
              </Tag>
            </WrapItem>
          ))}
        </Wrap>
        <Flex gap={2} flexWrap="wrap">
          <Input
            flex="1 1 200px"
            aria-label="New reason"
            placeholder="Add a reason (e.g. Speaking engagement)"
            value={newReason}
            onChange={(e) => setNewReason(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                addReason()
              }
            }}
          />
          <Button size="sm" {...outlineButtonProps} onClick={addReason} leftIcon={<AddIcon boxSize={2.5} />} flexShrink={0}>
            Add
          </Button>
          <Button
            size="sm"
            variant="ghost"
            color="page.fg-secondary"
            onClick={() => set.contact((c) => ({ ...c, reasons: [...DEFAULT_CONTACT_REASONS] }))}
            flexShrink={0}
          >
            Restore defaults
          </Button>
        </Flex>
      </Box>

      <SectionLabel
        index={8}
        title="Availability"
        hint="Whether you are open to work, shown on the contact page and in the command palette. Clear it to show nothing."
      />
      <AvailabilitySection value={form.availability} onChange={set.availability} />

      <SectionLabel
        index={9}
        title="Open source"
        hint="Repositories to feature first in the home page’s open-source section, in this order, with optional one-line blurbs."
      />
      <OpenSourceSection value={form.openSource} onChange={set.openSource} />

      <SectionLabel index={10} title="Site" hint="Site-wide identity." />
      <SiteSection value={form.site} onChange={set.site} />

      {/* Sticky save bar — always reachable, shows unsaved state. */}
      <Stack
        position="sticky"
        bottom={0}
        zIndex={10}
        mt={10}
        mx={{ base: -4, md: -6, lg: -8 }}
        px={{ base: 4, md: 6, lg: 8 }}
        py={3}
        spacing={3}
        bg="page.surface"
        backdropFilter="saturate(180%) blur(14px)"
        borderTop="1px solid"
        borderColor="page.border"
      >
        {sessionExpired ? <SessionExpiredNotice returnPath={RETURN_PATH} keepEdits /> : null}
        {errors.length ? (
          <Box role="alert" fontSize="xs" color="red.600" _dark={{ color: 'red.300' }}>
            {errors.slice(0, 5).map((e) => (
              <Text key={`${e.path}-${e.message}`}>{e.message}</Text>
            ))}
            {errors.length > 5 ? <Text>…and {errors.length - 5} more.</Text> : null}
          </Box>
        ) : null}
        <Flex align="center" justify="space-between" gap={3} flexWrap="wrap">
          <HStack spacing={3} minW={0}>
            <SaveStatus state={saveState} savedAt={savedAt} />
            {dirty ? (
              <Text fontSize="11px" color="page.fg-secondary" fontFamily={MONO} display={{ base: 'none', md: 'block' }}>
                Draft kept on this device
              </Text>
            ) : null}
          </HStack>
          <SaveButton onSave={() => void save(etagRef.current)} canSave={canSave && !conflictEtag} saving={saving} label="Save changes" />
        </Flex>
      </Stack>

      {/* Someone (another tab, a restore, a pull) saved since this form loaded. */}
      <AlertDialog isOpen={!!conflictEtag} leastDestructiveRef={conflictCancelRef} onClose={() => setConflictEtag(null)} isCentered>
        <AlertDialogOverlay>
          <AlertDialogContent bg="page.bg-elevated" border="1px solid" borderColor="page.border" mx={4}>
            <AlertDialogHeader fontSize="md">The home page changed since you opened it</AlertDialogHeader>
            <AlertDialogBody fontSize="sm">
              <Text>{conflictMessage || 'A newer version was saved elsewhere — another tab, a version restore or a storage pull.'}</Text>
              <Text mt={3} color="page.fg-secondary">
                <strong>Reload</strong> discards your edits and loads the latest version. <strong>Overwrite</strong> replaces the latest
                version with this form (a snapshot of it is kept, so it can be restored from Versions).
              </Text>
            </AlertDialogBody>
            <AlertDialogFooter gap={2} flexWrap="wrap">
              <Button ref={conflictCancelRef} size="sm" variant="ghost" onClick={() => setConflictEtag(null)}>
                Cancel
              </Button>
              <Button size="sm" {...outlineButtonProps} onClick={() => void reloadLatest()}>
                Reload latest
              </Button>
              <Button
                size="sm"
                {...primaryButtonProps}
                bg="red.600"
                _hover={{ bg: 'red.700' }}
                _active={{ bg: 'red.800' }}
                isLoading={saving}
                onClick={() => {
                  const target = conflictEtag
                  setConflictEtag(null)
                  void save(target)
                }}
              >
                Overwrite
              </Button>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialogOverlay>
      </AlertDialog>
    </Box>
  )
}
