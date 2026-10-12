import React, { useCallback, useEffect, useState, useRef } from 'react'
import {
  AlertDialog,
  AlertDialogBody,
  AlertDialogContent,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogOverlay,
  Button,
  Checkbox,
  FormControl,
  FormLabel,
  HStack,
  IconButton,
  Image,
  Input,
  SimpleGrid,
  Table,
  TableContainer,
  Tag,
  TagCloseButton,
  TagLabel,
  Tbody,
  Td,
  Th,
  Thead,
  Tr,
  Textarea,
  useToast,
  Wrap,
  WrapItem,
  Box,
  Text,
  Flex,
  Spinner,
  Stack,
} from '@chakra-ui/react'
import { AddIcon, DeleteIcon } from '@chakra-ui/icons'
// Pure shape import — must NOT come from lib/home.ts (server-only, drags
// better-sqlite3 into the client bundle). lib/homeShape.ts has no Node deps.
import { HOME_SECTION_META, type SectionKey } from '../../lib/homeShape'
import { useAdminDirty, useDirtyRegistration } from './AdminDirtyContext'
import { readJsonObject, uploadFilename, uploadImageDataUrl, fileToDataUrl } from './shell/http'
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

type Brand = { name: string; href: string; image: string }
type Quick = { label: string; url: string }
type Contact = { heading: string; blurb: string; eyebrow: string; reasons: string[] }

const DEFAULT_CONTACT_REASONS = [
  'Project Inquiry',
  'Hiring',
  'Collaboration',
  'Consulting',
  'Mentorship',
  'Other',
]

const RETURN_PATH = '/admin/dashboard?tab=home'

const TABLE_SX = {
  'th, td': { borderColor: 'page.border' },
  th: { fontFamily: MONO, fontSize: '10px', letterSpacing: '0.12em', color: 'page.fg-secondary' },
  'tbody tr:last-of-type td': { borderBottom: 'none' },
}
const MAX_UPLOAD_BYTES = 8 * 1024 * 1024

type LoadState = 'loading' | 'ready' | 'error' | 'session'

export default function HomeEditor() {
  const toast = useToast()
  const { confirmDiscard, clear } = useAdminDirty()
  const [hero, setHero] = useState({
    welcome: '',
    brand: '',
    tagline: '',
    avatarUrl: '',
    phone: '',
    email: '',
    // added: avatar transform control (x,y in %, scale multiplier)
    avatarTransform: { x: 50, y: 50, scale: 1 },
    // Three-line chip rendered under the avatar in the intro. Was hard-
    // coded; now editable so operators can update without redeploy.
    currentlyCoding: { label: '', project: '', note: '' },
  })
  const [socials, setSocials] = useState({
    github: '',
    gitlab: '',
    linkedin: '',
    whatsapp: '',
  })
  const [brands, setBrands] = useState<Brand[]>([])
  const [quickAccess, setQuick] = useState<Quick[]>([])
  const [photos, setPhotos] = useState<
    { url: string; describe?: string; redirectTo?: string; visible?: boolean }[]
  >([])
  // Per-section visibility map (key → bool). Defaults to all-visible —
  // a missing key always means "show" to be safe on first install.
  const [sections, setSections] = useState<Partial<Record<SectionKey, boolean>>>({})
  // Editable contact panel copy + reasons dropdown (was hard-coded
  // inside ContactPro.tsx; now driven from home.json).
  const [contact, setContact] = useState<Contact>({
    heading: '',
    blurb: '',
    eyebrow: '',
    reasons: [],
  })
  const [newReason, setNewReason] = useState('')
  // CV-derived defaults for the "currently coding" chip. Shown as input
  // placeholders so the operator can see what will auto-fill if they
  // leave a field blank. Best-effort: stays empty on any fetch error.
  const [ccAuto, setCcAuto] = useState<{ label: string; project: string; note: string }>({
    label: '',
    project: '',
    note: '',
  })

  // 'ready' only after a successful load of the ADMIN view: saving a form
  // that never loaded (or was filled from the public, pruned view) would
  // PUT an incomplete document over the live home page.
  const [loadState, setLoadState] = useState<LoadState>('loading')
  const [loadError, setLoadError] = useState('')
  const [saving, setSaving] = useState(false)
  const [baseline, setBaseline] = useState<string | null>(null)
  const [reloadKey, setReloadKey] = useState(0)
  // ETag of the version this form was loaded from / last saved as.
  const etagRef = useRef<string | null>(null)
  // Set when a save hit a newer version (409); holds that version's ETag.
  const [conflictEtag, setConflictEtag] = useState<string | null>(null)
  const [conflictMessage, setConflictMessage] = useState('')
  const [sessionExpired, setSessionExpired] = useState(false)
  const conflictCancelRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    let alive = true
    const load = async () => {
      setLoadState('loading')
      setSessionExpired(false)
      let data: any
      try {
        const res = await fetch('/api/admin/home', { cache: 'no-store' })
        if (res.status === 401 || (res.ok && res.headers.get('X-Home-View') !== 'admin')) {
          if (alive) setLoadState('session')
          return
        }
        if (!res.ok) throw new Error(`Server responded ${res.status}`)
        data = await res.json()
        etagRef.current = res.headers.get('ETag')
      } catch (e: any) {
        if (!alive) return
        setLoadError(
          e?.message === 'Failed to fetch' ? 'network error' : e?.message || 'Failed to load'
        )
        setLoadState('error')
        return
      }
      if (!alive) return
      setHero({
        welcome: data?.hero?.welcome || '',
        brand: data?.hero?.brand || '',
        tagline: data?.hero?.tagline || '',
        avatarUrl: data?.hero?.avatarUrl || '',
        phone: data?.hero?.phone || '',
        email: data?.hero?.email || '',
        avatarTransform: {
          x: data?.hero?.avatarTransform?.x ?? 50,
          y: data?.hero?.avatarTransform?.y ?? 50,
          scale: data?.hero?.avatarTransform?.scale ?? 1,
        },
        currentlyCoding: {
          label: data?.hero?.currentlyCoding?.label ?? '',
          project: data?.hero?.currentlyCoding?.project ?? '',
          note: data?.hero?.currentlyCoding?.note ?? '',
        },
      })
      setSocials({
        github: data?.socials?.github || '',
        gitlab: data?.socials?.gitlab || '',
        linkedin: data?.socials?.linkedin || '',
        whatsapp: data?.socials?.whatsapp || '',
      })
      setBrands(Array.isArray(data?.brands) ? data.brands : [])
      setQuick(Array.isArray(data?.quickAccess) ? data.quickAccess : [])
      setPhotos(Array.isArray(data?.photos) ? data.photos : [])
      setSections(data?.sections && typeof data.sections === 'object' ? data.sections : {})
      setContact({
        heading: data?.contact?.heading || '',
        blurb: data?.contact?.blurb || '',
        eyebrow: data?.contact?.eyebrow || '',
        reasons: Array.isArray(data?.contact?.reasons)
          ? data.contact.reasons.filter((r: unknown) => typeof r === 'string')
          : [],
      })
      setBaseline(null) // captured from the rendered state below
      setLoadState('ready')

      // CV-derived defaults for the placeholders. Best-effort.
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
  }, [reloadKey])

  const normalizeUrl = (u?: string) => {
    if (!u) return ''
    if (/^https?:\/\//i.test(u)) return u
    if (u.startsWith('/')) return u
    return '/' + u.replace(/^\.?\/*/, '')
  }

  // strip preview cache-busting param before save
  const stripTs = (u?: string) => {
    if (!u) return ''
    try {
      const base = typeof window !== 'undefined' ? window.location.origin : 'http://localhost'
      const url = new URL(u, base)
      url.searchParams.delete('__ts')
      // return path + query + hash for same-origin, or full URL for absolute
      if (url.origin === base) return url.pathname + (url.search || '') + (url.hash || '')
      return url.toString()
    } catch {
      return u.replace(/([?&])__ts=\d+(&|$)/, (p1, p2) => (p2 ? p1 : ''))
    }
  }

  const buildPayload = () => {
    return {
      hero: { ...hero, avatarUrl: normalizeUrl(stripTs(hero.avatarUrl)) },
      socials,
      brands: (brands || []).map((b) => ({
        ...b,
        image: normalizeUrl(stripTs(b.image)),
      })),
      quickAccess,
      photos: (photos || []).map((p) => ({
        ...p,
        url: normalizeUrl(stripTs(p.url)),
        redirectTo: p.redirectTo ? normalizeUrl(stripTs(p.redirectTo)) : undefined,
      })),
      sections,
      contact: {
        heading: contact.heading.trim(),
        blurb: contact.blurb.trim(),
        eyebrow: contact.eyebrow.trim(),
        reasons: contact.reasons.map((r) => r.trim()).filter(Boolean),
      },
    }
  }

  // Dirty tracking against the last loaded / saved state.
  const snapshot = JSON.stringify({ hero, socials, brands, quickAccess, photos, sections, contact })
  useEffect(() => {
    if (loadState === 'ready' && baseline === null) setBaseline(snapshot)
  }, [loadState, baseline, snapshot])
  const dirty = loadState === 'ready' && baseline !== null && snapshot !== baseline
  useDirtyRegistration('home', dirty)

  /**
   * PUT the form. `ifMatch` is the version the edit is based on: normally the
   * loaded ETag; after a conflict, "Overwrite" passes the newer version's
   * ETag to replace it deliberately.
   */
  const save = async (ifMatch: string | null) => {
    if (loadState !== 'ready' || saving) return
    const savedSnapshot = snapshot
    setSaving(true)
    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' }
      if (ifMatch) headers['If-Match'] = ifMatch
      const res = await fetch('/api/home', {
        method: 'PUT',
        headers,
        body: JSON.stringify(buildPayload()),
      })
      const body = await readJsonObject(res)
      if (res.ok) {
        const etag = (typeof body.etag === 'string' && body.etag) || res.headers.get('ETag')
        if (etag) etagRef.current = etag
        setBaseline(savedSnapshot)
        setConflictEtag(null)
        setSessionExpired(false)
        toast({
          status: body.r2Warning ? 'warning' : 'success',
          title: body.unchanged ? 'Nothing to save — already live' : 'Home saved',
          description: body.r2Warning,
          position: 'bottom-right',
        })
        return
      }
      if (res.status === 409) {
        setConflictEtag(
          (typeof body.etag === 'string' && body.etag) || res.headers.get('ETag') || '*'
        )
        setConflictMessage(typeof body.message === 'string' ? body.message : '')
        return
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
              : body.error || `HTTP ${res.status}`,
        position: 'bottom-right',
        duration: 7000,
        isClosable: true,
      })
    } catch (e: any) {
      toast({
        status: 'error',
        title: 'Save failed',
        description:
          e?.message === 'Failed to fetch'
            ? 'Network error — not saved.'
            : e?.message || 'Network error — not saved.',
        position: 'bottom-right',
      })
    } finally {
      setSaving(false)
    }
  }

  const validateUrl = (u: string) => /^\//.test(u) || /^https?:\/\//i.test(u)

  const validateAndSave = (ifMatch: string | null = etagRef.current) => {
    for (const p of photos) {
      if (p.url && !validateUrl(p.url)) {
        toast({
          status: 'error',
          title: 'Invalid photo URL',
          description: p.url,
          position: 'bottom-right',
        })
        return
      }
      if (p.redirectTo && !validateUrl(p.redirectTo)) {
        toast({
          status: 'error',
          title: 'Invalid link URL',
          description: p.redirectTo,
          position: 'bottom-right',
        })
        return
      }
    }
    void save(ifMatch)
  }

  const canSave = loadState === 'ready' && dirty && !saving
  useSaveShortcut(canSave && !conflictEtag, () => validateAndSave())

  const reloadLatest = useCallback(() => {
    if (
      !confirmDiscard(
        'Reload the latest saved version? Your unsaved home page edits will be discarded.'
      )
    )
      return
    clear('home')
    setConflictEtag(null)
    setReloadKey((k) => k + 1)
  }, [confirmDiscard, clear])

  const toggleSection = (key: SectionKey, visible: boolean) => {
    setSections((prev) => ({ ...prev, [key]: visible }))
  }

  const addReason = () => {
    const v = newReason.trim()
    if (!v) return
    if (contact.reasons.includes(v)) {
      toast({ status: 'info', title: 'Already in the list' })
      return
    }
    setContact((c) => ({ ...c, reasons: [...c.reasons, v] }))
    setNewReason('')
  }
  const removeReason = (idx: number) => {
    setContact((c) => ({ ...c, reasons: c.reasons.filter((_, i) => i !== idx) }))
  }
  const restoreDefaultReasons = () => {
    setContact((c) => ({ ...c, reasons: [...DEFAULT_CONTACT_REASONS] }))
  }

  /**
   * Compress (JPEG stays JPEG; PNG / WebP → WebP to keep alpha; GIF untouched)
   * and upload. Every failure — unreadable file, network error, a 413 or
   * other non-JSON error page — ends in a toast, never an unhandled rejection.
   */
  const onUpload = async (file: File, setter: (url: string) => void) => {
    if (file.size > MAX_UPLOAD_BYTES) {
      toast({
        status: 'error',
        title: 'Image is too large — the limit is 8 MB.',
        position: 'bottom-right',
      })
      return
    }
    try {
      let dataUrl = await fileToDataUrl(file)
      try {
        if (file.type === 'image/jpeg')
          dataUrl = await compressImageDataUrl(dataUrl, 1600, 1600, 0.82, 'image/jpeg')
        else if (file.type === 'image/png' || file.type === 'image/webp')
          dataUrl = await compressImageDataUrl(dataUrl, 1600, 1600, 0.9, 'image/webp')
      } catch {
        /* upload the original */
      }
      const ext = (dataUrl.match(/^data:image\/(\w+)/)?.[1] || 'png').replace('jpeg', 'jpg')
      const { url, warning } = await uploadImageDataUrl(
        uploadFilename(file.name || 'image', ext),
        dataUrl
      )
      // Cache-bust so the preview shows the new file; stripped again on save.
      setter(url + (url.includes('?') ? '&' : '?') + '__ts=' + Date.now())
      toast({
        status: warning ? 'warning' : 'success',
        title: 'Image uploaded',
        description: warning,
        position: 'bottom-right',
      })
    } catch (err) {
      toast({
        status: 'error',
        title: 'Image upload failed',
        description: err instanceof Error ? err.message : String(err),
        position: 'bottom-right',
      })
    }
  }

  async function compressImageDataUrl(
    srcDataUrl: string,
    maxW: number,
    maxH: number,
    quality: number,
    type: 'image/jpeg' | 'image/webp' = 'image/jpeg'
  ): Promise<string> {
    return new Promise((resolve) => {
      const img = new window.Image()
      img.onload = () => {
        let { width, height } = img as any
        const ratio = Math.min(maxW / width, maxH / height, 1)
        width = Math.round(width * ratio)
        height = Math.round(height * ratio)
        const canvas = document.createElement('canvas')
        canvas.width = width
        canvas.height = height
        const ctx = canvas.getContext('2d')
        if (!ctx) return resolve(srcDataUrl)
        ctx.drawImage(img, 0, 0, width, height)
        const out = canvas.toDataURL(type, quality)
        // Browsers that can't encode WebP silently return PNG — keep the original then.
        resolve(out.startsWith(`data:${type}`) ? out : srcDataUrl)
      }
      img.onerror = () => resolve(srcDataUrl)
      img.src = srcDataUrl
    })
  }

  // --- Avatar Position/Scale Editor (Grid + Drag) ---
  const frameRef = useRef<HTMLDivElement | null>(null)
  const dragState = useRef<{
    startX: number
    startY: number
    startPosX: number
    startPosY: number
    dragging: boolean
  }>({ startX: 0, startY: 0, startPosX: 50, startPosY: 50, dragging: false })

  const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v))

  const onPointerDown = (e: React.PointerEvent) => {
    if (!frameRef.current) return
    const { x, y } = hero.avatarTransform || { x: 50, y: 50 }
    dragState.current = {
      startX: e.clientX,
      startY: e.clientY,
      startPosX: x,
      startPosY: y,
      dragging: true,
    }
    ;(e.target as Element).setPointerCapture?.(e.pointerId)
  }

  const onPointerMove = (e: React.PointerEvent) => {
    if (!dragState.current.dragging || !frameRef.current) return
    const rect = frameRef.current.getBoundingClientRect()
    const dx = e.clientX - dragState.current.startX
    const dy = e.clientY - dragState.current.startY
    // translate pixel delta to % of frame
    const nx = clamp(dragState.current.startPosX + (dx / rect.width) * 100, 0, 100)
    const ny = clamp(dragState.current.startPosY + (dy / rect.height) * 100, 0, 100)
    setHero((h) => ({
      ...h,
      avatarTransform: { ...h.avatarTransform, x: nx, y: ny },
    }))
  }

  const onPointerUp = (e: React.PointerEvent) => {
    dragState.current.dragging = false
    ;(e.target as Element).releasePointerCapture?.(e.pointerId)
  }

  const resetAvatarTransform = () => {
    setHero((h) => ({ ...h, avatarTransform: { x: 50, y: 50, scale: 1 } }))
  }

  if (loadState === 'loading') {
    return (
      <Flex
        h="40vh"
        align="center"
        justify="center"
        role="status"
        aria-label="Loading the home page content"
      >
        <Spinner color="accent.500" />
      </Flex>
    )
  }
  if (loadState === 'session') return <SessionExpiredNotice returnPath={RETURN_PATH} />
  if (loadState === 'error') {
    return (
      <LoadErrorNotice
        what="the home page content"
        error={loadError}
        onRetry={() => setReloadKey((k) => k + 1)}
      />
    )
  }

  const saveState: SaveState = saving ? 'saving' : dirty ? 'dirty' : 'clean'

  return (
    <Box maxW="var(--container-content)" mx="auto">
      <SectionLabel
        index={1}
        title="Hero"
        hint="Greeting, name, tagline, avatar and contact details at the top of the home page."
      />
      <SimpleGrid columns={[1, 2]} gap={4}>
        <FormControl>
          <FormLabel>Welcome</FormLabel>
          <Input
            value={hero.welcome}
            onChange={(e) => setHero({ ...hero, welcome: e.target.value })}
          />
        </FormControl>
        <FormControl>
          <FormLabel>Brand</FormLabel>
          <Input value={hero.brand} onChange={(e) => setHero({ ...hero, brand: e.target.value })} />
        </FormControl>
        <FormControl gridColumn="1 / -1">
          <FormLabel>Tagline</FormLabel>
          <Textarea
            value={hero.tagline}
            onChange={(e) => setHero({ ...hero, tagline: e.target.value })}
          />
        </FormControl>
        <FormControl>
          <FormLabel>Avatar URL</FormLabel>
          <Input
            value={hero.avatarUrl}
            onChange={(e) => setHero({ ...hero, avatarUrl: e.target.value })}
          />
          {/* avatar preview */}
          {hero.avatarUrl ? (
            <Image
              src={normalizeUrl(hero.avatarUrl)}
              alt="avatar"
              boxSize="60px"
              objectFit="cover"
              mt={2}
            />
          ) : null}
        </FormControl>
        <FormControl>
          <FormLabel>Upload Avatar</FormLabel>
          <Input
            type="file"
            accept="image/*"
            onChange={(e) => {
              const input = e.target as HTMLInputElement
              const f = input.files?.[0]
              if (f) onUpload(f, (url) => setHero((h) => ({ ...h, avatarUrl: url })))
              // clear to allow re-selecting same file
              input.value = ''
            }}
          />
        </FormControl>

        {/* Avatar Positioning (Grid + Drag + Scale) */}
        <FormControl gridColumn="1 / -1">
          <FormLabel>Avatar Position (Drag inside frame) · Scale</FormLabel>
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
                // Grid overlay (industry standard alignment aid)
                _before={{
                  content: '""',
                  position: 'absolute',
                  inset: 0,
                  backgroundImage: `
                    repeating-linear-gradient(
                      0deg,
                      rgba(255,255,255,0.15) 0,
                      rgba(255,255,255,0.15) 1px,
                      transparent 1px,
                      transparent 20px
                    ),
                    repeating-linear-gradient(
                      90deg,
                      rgba(255,255,255,0.15) 0,
                      rgba(255,255,255,0.15) 1px,
                      transparent 1px,
                      transparent 20px
                    )
                  `,
                  pointerEvents: 'none',
                }}
                onPointerDown={onPointerDown}
                onPointerMove={onPointerMove}
                onPointerUp={onPointerUp}
                onPointerCancel={onPointerUp}
                cursor="grab"
                bg="black"
              >
                {hero.avatarUrl ? (
                  <Image
                    src={normalizeUrl(hero.avatarUrl)}
                    alt="avatar-position-preview"
                    w="100%"
                    h="100%"
                    objectFit="cover"
                    sx={{
                      objectPosition: `${hero.avatarTransform.x}% ${hero.avatarTransform.y}%`,
                    }}
                    transform={`scale(${hero.avatarTransform.scale})`}
                    transformOrigin={`${hero.avatarTransform.x}% ${hero.avatarTransform.y}%`}
                    draggable={false}
                    pointerEvents="none"
                  />
                ) : (
                  <Flex
                    w="full"
                    h="full"
                    align="center"
                    justify="center"
                    color="page.muted"
                    bg="page.bg-elevated"
                  >
                    <Text>No avatar</Text>
                  </Flex>
                )}
              </Box>
              <HStack mt={3} spacing={3}>
                <Button size="sm" {...outlineButtonProps} onClick={resetAvatarTransform}>
                  Reset
                </Button>
                <Text fontSize="sm" color="page.fg-secondary">
                  X: {Math.round(hero.avatarTransform.x)}% · Y: {Math.round(hero.avatarTransform.y)}
                  % · Scale: {hero.avatarTransform.scale.toFixed(2)}
                </Text>
              </HStack>
            </Box>

            <Box minW="260px">
              <FormLabel mb={1}>Scale</FormLabel>
              <Input
                type="range"
                min={1}
                max={3}
                step={0.01}
                value={hero.avatarTransform.scale}
                onChange={(e) =>
                  setHero((h) => ({
                    ...h,
                    avatarTransform: {
                      ...h.avatarTransform,
                      scale: Number(e.target.value),
                    },
                  }))
                }
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
                    onChange={(e) =>
                      setHero((h) => ({
                        ...h,
                        avatarTransform: {
                          ...h.avatarTransform,
                          x: clamp(Number(e.target.value), 0, 100),
                        },
                      }))
                    }
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
                    onChange={(e) =>
                      setHero((h) => ({
                        ...h,
                        avatarTransform: {
                          ...h.avatarTransform,
                          y: clamp(Number(e.target.value), 0, 100),
                        },
                      }))
                    }
                    width="100px"
                  />
                </Box>
              </HStack>
            </Box>
          </HStack>
        </FormControl>

        <FormControl>
          <FormLabel>Phone</FormLabel>
          <Input value={hero.phone} onChange={(e) => setHero({ ...hero, phone: e.target.value })} />
        </FormControl>
        <FormControl>
          <FormLabel>Email</FormLabel>
          <Input value={hero.email} onChange={(e) => setHero({ ...hero, email: e.target.value })} />
        </FormControl>

        {/*
          "Currently coding" chip — three short lines rendered under the
          intro avatar. Each field follows admin > CV > nothing precedence:
          if you type a value, it wins; if you leave it blank, the home
          page auto-fills from data/cvdata.json (current company, earliest
          year, generic label); if both are empty the line is omitted.
          Clearing all three suppresses the whole chip when there's no
          CV signal either.

          The placeholders mirror what /api/admin/cv-derived returns now,
          so an operator sees exactly what visitors will see if they leave
          a row blank. Falls back to instructive examples when CV is empty.
        */}
        <FormControl gridColumn="1 / -1">
          <FormLabel>
            Currently coding chip
            <Text as="span" color="page.fg-secondary" fontWeight="normal" fontSize="xs" ml={2}>
              shown under avatar on home · blank = auto-fill from CV
            </Text>
          </FormLabel>
          <SimpleGrid columns={[1, 3]} gap={3}>
            <Input
              placeholder={
                ccAuto.label ? `auto: ${ccAuto.label}` : 'Top label (e.g. currently coding)'
              }
              value={hero.currentlyCoding.label}
              onChange={(e) =>
                setHero((h) => ({
                  ...h,
                  currentlyCoding: { ...h.currentlyCoding, label: e.target.value },
                }))
              }
            />
            <Input
              placeholder={
                ccAuto.project ? `auto: ${ccAuto.project}` : 'Project line (e.g. WeGreen AI · COT)'
              }
              value={hero.currentlyCoding.project}
              onChange={(e) =>
                setHero((h) => ({
                  ...h,
                  currentlyCoding: { ...h.currentlyCoding, project: e.target.value },
                }))
              }
            />
            <Input
              placeholder={
                ccAuto.note ? `auto: ${ccAuto.note}` : 'Footer note (e.g. self-taught · since 2022)'
              }
              value={hero.currentlyCoding.note}
              onChange={(e) =>
                setHero((h) => ({
                  ...h,
                  currentlyCoding: { ...h.currentlyCoding, note: e.target.value },
                }))
              }
            />
          </SimpleGrid>
          <Text mt={2} fontSize="xs" color="page.fg-secondary">
            Auto-derived now:{' '}
            <Text as="span" color="page.fg" fontFamily={MONO}>
              {ccAuto.label || '—'}
            </Text>
            {' · '}
            <Text as="span" color="page.fg" fontFamily={MONO}>
              {ccAuto.project || '—'}
            </Text>
            {' · '}
            <Text as="span" color="page.fg" fontFamily={MONO}>
              {ccAuto.note || '—'}
            </Text>
          </Text>
        </FormControl>
      </SimpleGrid>

      <SectionLabel
        index={2}
        title="Socials"
        hint="Profile URLs for GitHub, GitLab, LinkedIn and WhatsApp."
      />
      <SimpleGrid columns={[1, 2]} gap={4}>
        <FormControl>
          <FormLabel>GitHub</FormLabel>
          <Input
            value={socials.github}
            onChange={(e) => setSocials({ ...socials, github: e.target.value })}
          />
        </FormControl>
        <FormControl>
          <FormLabel>GitLab</FormLabel>
          <Input
            value={socials.gitlab}
            onChange={(e) => setSocials({ ...socials, gitlab: e.target.value })}
          />
        </FormControl>
        <FormControl>
          <FormLabel>LinkedIn</FormLabel>
          <Input
            value={socials.linkedin}
            onChange={(e) => setSocials({ ...socials, linkedin: e.target.value })}
          />
        </FormControl>
        <FormControl>
          <FormLabel>WhatsApp</FormLabel>
          <Input
            value={socials.whatsapp}
            onChange={(e) => setSocials({ ...socials, whatsapp: e.target.value })}
          />
        </FormControl>
      </SimpleGrid>

      <SectionLabel
        index={3}
        title="Brands"
        hint="Affiliation names, links and logos, in display order."
      />
      <TableContainer
        overflowX="auto"
        w="100%"
        border="1px solid"
        borderColor="page.border"
        borderRadius="lg"
        sx={TABLE_SX}
      >
        <Table variant="simple" size="sm">
          <Thead>
            <Tr>
              <Th>Name</Th>
              <Th>Link</Th>
              <Th>Image</Th>
              <Th>Upload</Th>
              <Th></Th>
            </Tr>
          </Thead>
          <Tbody>
            {brands.map((b, idx) => (
              <Tr key={idx}>
                <Td>
                  <Input
                    value={b.name}
                    aria-label={`Brand ${idx + 1} name`}
                    onChange={(e) => {
                      const arr = [...brands]
                      arr[idx] = { ...arr[idx], name: e.target.value }
                      setBrands(arr)
                    }}
                  />
                </Td>
                <Td>
                  <Input
                    value={b.href}
                    aria-label={`Brand ${idx + 1} link`}
                    onChange={(e) => {
                      const arr = [...brands]
                      arr[idx] = { ...arr[idx], href: e.target.value }
                      setBrands(arr)
                    }}
                  />
                </Td>
                <Td>
                  <Input
                    value={b.image}
                    aria-label={`Brand ${idx + 1} image URL`}
                    onChange={(e) => {
                      const arr = [...brands]
                      arr[idx] = { ...arr[idx], image: e.target.value }
                      setBrands(arr)
                    }}
                  />
                  {/* brand image preview */}
                  {b.image ? (
                    <Image
                      src={normalizeUrl(b.image)}
                      alt={b.name || 'brand'}
                      boxSize="60px"
                      objectFit="cover"
                      mt={2}
                    />
                  ) : null}
                </Td>
                <Td>
                  <Input
                    type="file"
                    aria-label={`Upload brand ${idx + 1} image`}
                    accept="image/*"
                    onChange={(e) => {
                      const input = e.target as HTMLInputElement
                      const f = input.files?.[0]
                      if (f)
                        onUpload(f, (url) =>
                          setBrands((prev) =>
                            prev.map((b, i) => (i === idx ? { ...b, image: url } : b))
                          )
                        )
                      // clear to allow re-selecting same file
                      input.value = ''
                    }}
                  />
                </Td>
                <Td>
                  <IconButton
                    aria-label={`Remove brand ${idx + 1}`}
                    size="sm"
                    variant="ghost"
                    color="page.fg-secondary"
                    _hover={{ color: 'red.400', bg: 'page.bg-overlay' }}
                    icon={<DeleteIcon />}
                    onClick={() => setBrands(brands.filter((_, i) => i !== idx))}
                  />
                </Td>
              </Tr>
            ))}
          </Tbody>
        </Table>
      </TableContainer>
      <Button
        size="sm"
        mt={3}
        {...outlineButtonProps}
        leftIcon={<AddIcon boxSize={2.5} />}
        onClick={() => setBrands([...brands, { name: '', href: '', image: '' }])}
      >
        Add brand
      </Button>

      <SectionLabel index={4} title="Quick access" hint="Shortcut links, in display order." />
      <TableContainer
        overflowX="auto"
        w="100%"
        border="1px solid"
        borderColor="page.border"
        borderRadius="lg"
        sx={TABLE_SX}
      >
        <Table variant="simple" size="sm">
          <Thead>
            <Tr>
              <Th>Label</Th>
              <Th>URL</Th>
              <Th></Th>
            </Tr>
          </Thead>
          <Tbody>
            {quickAccess.map((q, idx) => (
              <Tr key={idx}>
                <Td>
                  <Input
                    value={q.label}
                    aria-label={`Quick link ${idx + 1} label`}
                    onChange={(e) => {
                      const arr = [...quickAccess]
                      arr[idx] = { ...arr[idx], label: e.target.value }
                      setQuick(arr)
                    }}
                  />
                </Td>
                <Td>
                  <Input
                    value={q.url}
                    aria-label={`Quick link ${idx + 1} URL`}
                    onChange={(e) => {
                      const arr = [...quickAccess]
                      arr[idx] = { ...arr[idx], url: e.target.value }
                      setQuick(arr)
                    }}
                  />
                </Td>
                <Td>
                  <IconButton
                    aria-label={`Remove quick link ${idx + 1}`}
                    size="sm"
                    variant="ghost"
                    color="page.fg-secondary"
                    _hover={{ color: 'red.400', bg: 'page.bg-overlay' }}
                    icon={<DeleteIcon />}
                    onClick={() => setQuick(quickAccess.filter((_, i) => i !== idx))}
                  />
                </Td>
              </Tr>
            ))}
          </Tbody>
        </Table>
      </TableContainer>
      <Button
        size="sm"
        mt={3}
        {...outlineButtonProps}
        leftIcon={<AddIcon boxSize={2.5} />}
        onClick={() => setQuick([...quickAccess, { label: '', url: '' }])}
      >
        Add quick link
      </Button>

      <SectionLabel
        index={5}
        title="Photos"
        hint="Gallery images. Drag rows or use the arrows to reorder; untick Visible to hide one without deleting it."
      />
      <TableContainer
        overflowX="auto"
        w="100%"
        border="1px solid"
        borderColor="page.border"
        borderRadius="lg"
        sx={TABLE_SX}
      >
        <Table variant="simple" size="sm">
          <Thead>
            <Tr>
              <Th>#</Th>
              <Th>Preview</Th>
              <Th>Image URL</Th>
              <Th>Description</Th>
              <Th>Link</Th>
              <Th>Visible</Th>
              <Th>Upload</Th>
              <Th>Order</Th>
              <Th></Th>
            </Tr>
          </Thead>
          <Tbody>
            {photos.map((p, idx) => (
              <Tr
                key={idx}
                draggable
                onDragStart={(e) => e.dataTransfer.setData('text/plain', String(idx))}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault()
                  const from = Number(e.dataTransfer.getData('text/plain'))
                  if (Number.isNaN(from)) return
                  const arr = [...photos]
                  const [moved] = arr.splice(from, 1)
                  arr.splice(idx, 0, moved)
                  setPhotos(arr)
                }}
              >
                <Td>{idx + 1}</Td>
                <Td>
                  {p.url ? (
                    <Image
                      src={normalizeUrl(p.url)}
                      alt="preview"
                      boxSize="60px"
                      objectFit="cover"
                    />
                  ) : null}
                </Td>
                <Td>
                  <Input
                    value={p.url}
                    aria-label={`Photo ${idx + 1} image URL`}
                    onChange={(e) => {
                      const val = e.target.value
                      const arr = [...photos]
                      arr[idx] = { ...arr[idx], url: val }
                      setPhotos(arr)
                    }}
                    isInvalid={!!p.url && !validateUrl(p.url)}
                  />
                </Td>
                <Td>
                  <Input
                    value={p.describe || ''}
                    aria-label={`Photo ${idx + 1} description`}
                    onChange={(e) => {
                      const arr = [...photos]
                      arr[idx] = { ...arr[idx], describe: e.target.value }
                      setPhotos(arr)
                    }}
                  />
                </Td>
                <Td>
                  <Input
                    value={p.redirectTo || ''}
                    aria-label={`Photo ${idx + 1} link`}
                    onChange={(e) => {
                      const val = e.target.value
                      const arr = [...photos]
                      arr[idx] = { ...arr[idx], redirectTo: val }
                      setPhotos(arr)
                    }}
                    isInvalid={!!p.redirectTo && !validateUrl(p.redirectTo)}
                  />
                </Td>
                <Td>
                  <Checkbox
                    isChecked={p.visible !== false}
                    onChange={(e) => {
                      const arr = [...photos]
                      arr[idx] = { ...arr[idx], visible: e.target.checked }
                      setPhotos(arr)
                    }}
                  >
                    Visible
                  </Checkbox>
                </Td>
                <Td>
                  <Input
                    type="file"
                    aria-label={`Upload photo ${idx + 1}`}
                    accept="image/*"
                    onChange={(e) => {
                      const input = e.target as HTMLInputElement
                      const f = input.files?.[0]
                      if (f)
                        onUpload(f, (url) =>
                          setPhotos((prev) => prev.map((p, i) => (i === idx ? { ...p, url } : p)))
                        )
                      // clear to allow re-selecting same file
                      input.value = ''
                    }}
                  />
                </Td>
                <Td>
                  <HStack>
                    <IconButton
                      size="sm"
                      variant="ghost"
                      color="page.fg-secondary"
                      aria-label={`Move photo ${idx + 1} up`}
                      icon={<span aria-hidden>↑</span>}
                      isDisabled={idx === 0}
                      onClick={() => {
                        if (idx === 0) return
                        const arr = [...photos]
                        const t = arr[idx - 1]
                        arr[idx - 1] = arr[idx]
                        arr[idx] = t
                        setPhotos(arr)
                      }}
                    />
                    <IconButton
                      size="sm"
                      variant="ghost"
                      color="page.fg-secondary"
                      aria-label={`Move photo ${idx + 1} down`}
                      icon={<span aria-hidden>↓</span>}
                      isDisabled={idx === photos.length - 1}
                      onClick={() => {
                        if (idx === photos.length - 1) return
                        const arr = [...photos]
                        const t = arr[idx + 1]
                        arr[idx + 1] = arr[idx]
                        arr[idx] = t
                        setPhotos(arr)
                      }}
                    />
                  </HStack>
                </Td>
                <Td>
                  <IconButton
                    aria-label={`Remove photo ${idx + 1}`}
                    size="sm"
                    variant="ghost"
                    color="page.fg-secondary"
                    _hover={{ color: 'red.400', bg: 'page.bg-overlay' }}
                    icon={<DeleteIcon />}
                    onClick={() => setPhotos(photos.filter((_, i) => i !== idx))}
                  />
                </Td>
              </Tr>
            ))}
          </Tbody>
        </Table>
      </TableContainer>
      <Button
        size="sm"
        mt={3}
        {...outlineButtonProps}
        leftIcon={<AddIcon boxSize={2.5} />}
        onClick={() =>
          setPhotos([...(photos || []), { url: '', describe: '', redirectTo: '', visible: true }])
        }
      >
        Add photo
      </Button>

      {/* ── Section visibility ─────────────────────────────────────── */}
      <SectionLabel
        index={6}
        title="Visibility"
        hint="Toggle which [NN] rows appear on the home page. Hiding a row also removes its anchor and scroll target — the numbering of the rest stays the same because labels are static."
      />
      <SimpleGrid columns={[1, 2, 3]} gap={3}>
        {HOME_SECTION_META.map(({ key, label, hint }) => {
          const visible = sections[key] !== false
          return (
            <Flex
              key={key}
              align="flex-start"
              gap={3}
              p={3}
              borderWidth="1px"
              borderRadius="md"
              borderColor={visible ? 'accent.500' : 'page.border'}
              bg={visible ? 'var(--accent-soft)' : 'page.bg-elevated'}
              transition="border-color 180ms var(--ease-out-quart), background-color 180ms var(--ease-out-quart)"
            >
              <Checkbox
                isChecked={visible}
                onChange={(e) => toggleSection(key, e.target.checked)}
                mt={0.5}
              />
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

      {/* ── Contact panel copy ─────────────────────────────────────── */}
      <SectionLabel
        index={7}
        title="Contact panel"
        hint={
          <>
            Heading and reasons dropdown of the home contact section. Leave a field blank to use the
            built-in default (heading = brand name, blurb = &ldquo;I usually reply within 24
            hours.&rdquo;, eyebrow = &ldquo;▸ Reach me&rdquo;). Reasons fall back to the original
            six when the list is empty.
          </>
        }
      />
      <SimpleGrid columns={[1, 2]} gap={3}>
        <FormControl>
          <FormLabel>Eyebrow</FormLabel>
          <Input
            placeholder="▸ Reach me"
            value={contact.eyebrow}
            onChange={(e) => setContact((c) => ({ ...c, eyebrow: e.target.value }))}
          />
        </FormControl>
        <FormControl>
          <FormLabel>Heading</FormLabel>
          <Input
            placeholder={hero.brand || 'Contact'}
            value={contact.heading}
            onChange={(e) => setContact((c) => ({ ...c, heading: e.target.value }))}
          />
        </FormControl>
        <FormControl gridColumn="1 / -1">
          <FormLabel>Blurb</FormLabel>
          <Input
            placeholder="I usually reply within 24 hours."
            value={contact.blurb}
            onChange={(e) => setContact((c) => ({ ...c, blurb: e.target.value }))}
          />
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
          {contact.reasons.length === 0 && (
            <Text fontSize="xs" color="page.fg-secondary" fontStyle="italic">
              No custom reasons — the dropdown will show:{' '}
              <strong>{DEFAULT_CONTACT_REASONS.join(', ')}</strong>
            </Text>
          )}
          {contact.reasons.map((r, idx) => (
            <WrapItem key={`${r}-${idx}`}>
              <Tag
                size="md"
                borderRadius="full"
                variant="outline"
                color="page.fg"
                boxShadow="inset 0 0 0 1px var(--chakra-colors-page-border-strong)"
              >
                <TagLabel>{r}</TagLabel>
                <TagCloseButton onClick={() => removeReason(idx)} />
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
          <Button
            size="sm"
            {...outlineButtonProps}
            onClick={addReason}
            leftIcon={<AddIcon boxSize={2.5} />}
            flexShrink={0}
          >
            Add
          </Button>
          <Button
            size="sm"
            variant="ghost"
            color="page.fg-secondary"
            onClick={restoreDefaultReasons}
            flexShrink={0}
          >
            Restore defaults
          </Button>
        </Flex>
      </Box>

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
        <Flex align="center" justify="space-between" gap={3} flexWrap="wrap">
          <SaveStatus state={saveState} />
          <SaveButton
            onSave={() => validateAndSave()}
            canSave={canSave && !conflictEtag}
            saving={saving}
            label="Save changes"
          />
        </Flex>
      </Stack>

      {/* Someone (another tab, a restore, a pull) saved since this form loaded. */}
      <AlertDialog
        isOpen={!!conflictEtag}
        leastDestructiveRef={conflictCancelRef}
        onClose={() => setConflictEtag(null)}
        isCentered
      >
        <AlertDialogOverlay>
          <AlertDialogContent
            bg="page.bg-elevated"
            border="1px solid"
            borderColor="page.border"
            mx={4}
          >
            <AlertDialogHeader fontSize="md">
              The home page changed since you opened it
            </AlertDialogHeader>
            <AlertDialogBody fontSize="sm">
              <Text>
                {conflictMessage ||
                  'A newer version was saved elsewhere — another tab, a version restore or a storage pull.'}
              </Text>
              <Text mt={3} color="page.fg-secondary">
                <strong>Reload</strong> discards your edits and loads the latest version.{' '}
                <strong>Overwrite</strong> replaces the latest version with this form (a snapshot of
                it is kept, so it can be restored from Versions).
              </Text>
            </AlertDialogBody>
            <AlertDialogFooter gap={2} flexWrap="wrap">
              <Button
                ref={conflictCancelRef}
                size="sm"
                variant="ghost"
                onClick={() => setConflictEtag(null)}
              >
                Cancel
              </Button>
              <Button size="sm" {...outlineButtonProps} onClick={reloadLatest}>
                Reload latest
              </Button>
              <Button
                size="sm"
                {...primaryButtonProps}
                bg="red.500"
                _hover={{ bg: 'red.600' }}
                _active={{ bg: 'red.700' }}
                isLoading={saving}
                onClick={() => {
                  const target = conflictEtag
                  setConflictEtag(null)
                  validateAndSave(target)
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
