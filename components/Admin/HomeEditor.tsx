import React, { useEffect, useState, useRef } from 'react'
import {
  Button,
  Checkbox,
  Divider,
  FormControl,
  FormLabel,
  Heading,
  HStack,
  IconButton,
  Image,
  Input,
  SimpleGrid,
  Table,
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
} from '@chakra-ui/react'
import { AddIcon, DeleteIcon } from '@chakra-ui/icons'
// Pure shape import — must NOT come from lib/home.ts (server-only, drags
// better-sqlite3 into the client bundle). lib/homeShape.ts has no Node deps.
import { HOME_SECTION_META, type SectionKey } from '../../lib/homeShape'

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

export default function HomeEditor() {
  const toast = useToast()
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
  // leave a field blank. Auth-gated server endpoint; falls back to empty
  // on any fetch error (no UX regression — placeholders just show generic
  // examples).
  const [ccAuto, setCcAuto] = useState<{ label: string; project: string; note: string }>({
    label: '',
    project: '',
    note: '',
  })

  useEffect(() => {
    const load = async () => {
      const res = await fetch('/api/home')
      const data = await res.json()
      if (data) {
        setHero({
          welcome: data.hero?.welcome || '',
          brand: data.hero?.brand || '',
          tagline: data.hero?.tagline || '',
          avatarUrl: data.hero?.avatarUrl || '',
          phone: data.hero?.phone || '',
          email: data.hero?.email || '',
          avatarTransform: {
            x: data.hero?.avatarTransform?.x ?? 50,
            y: data.hero?.avatarTransform?.y ?? 50,
            scale: data.hero?.avatarTransform?.scale ?? 1,
          },
          currentlyCoding: {
            label: data.hero?.currentlyCoding?.label ?? '',
            project: data.hero?.currentlyCoding?.project ?? '',
            note: data.hero?.currentlyCoding?.note ?? '',
          },
        })
        setSocials({
          github: data.socials?.github || '',
          gitlab: data.socials?.gitlab || '',
          linkedin: data.socials?.linkedin || '',
          whatsapp: data.socials?.whatsapp || '',
        })
        setBrands(Array.isArray(data.brands) ? data.brands : [])
        setQuick(Array.isArray(data.quickAccess) ? data.quickAccess : [])
        setPhotos(Array.isArray(data.photos) ? data.photos : [])
        setSections(
          data.sections && typeof data.sections === 'object' ? data.sections : {},
        )
        setContact({
          heading: data.contact?.heading || '',
          blurb: data.contact?.blurb || '',
          eyebrow: data.contact?.eyebrow || '',
          reasons: Array.isArray(data.contact?.reasons)
            ? data.contact.reasons.filter((r: unknown) => typeof r === 'string')
            : [],
        })
      }

      // Pull CV-derived defaults in parallel. Best-effort: stays blank
      // on failure so the editor still works.
      try {
        const dr = await fetch('/api/admin/cv-derived')
        if (dr.ok) {
          const dj = await dr.json()
          if (dj?.currentlyCoding) {
            setCcAuto({
              label: dj.currentlyCoding.label || '',
              project: dj.currentlyCoding.project || '',
              note: dj.currentlyCoding.note || '',
            })
          }
        }
      } catch {
        // ignore — placeholders just stay generic
      }
    }
    load()
  }, [])

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
      const base =
        typeof window !== 'undefined'
          ? window.location.origin
          : 'http://localhost'
      const url = new URL(u, base)
      url.searchParams.delete('__ts')
      // return path + query + hash for same-origin, or full URL for absolute
      if (url.origin === base)
        return url.pathname + (url.search || '') + (url.hash || '')
      return url.toString()
    } catch {
      return u.replace(/([?&])__ts=\d+(&|$)/, (p1, p2) => (p2 ? p1 : ''))
    }
  }

  const save = async () => {
    const payload = {
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
        redirectTo: p.redirectTo
          ? normalizeUrl(stripTs(p.redirectTo))
          : undefined,
      })),
      sections,
      contact: {
        heading: contact.heading.trim(),
        blurb: contact.blurb.trim(),
        eyebrow: contact.eyebrow.trim(),
        reasons: contact.reasons.map((r) => r.trim()).filter(Boolean),
      },
    }
    const res = await fetch('/api/home', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    if (res.ok) toast({ status: 'success', title: 'Saved' })
    else toast({ status: 'error', title: 'Save failed (login?)' })
  }

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

  const validateUrl = (u: string) => /^\//.test(u) || /^https?:\/\//i.test(u)
  const onUpload = async (file: File, setter: (url: string) => void) => {
    if (file.size > 8 * 1024 * 1024) {
      toast({ status: 'error', title: 'File too large (>8MB)' })
      return
    }
    const reader = new FileReader()
    reader.onload = async () => {
      let dataUrl = reader.result as string
      try {
        dataUrl = await compressImageDataUrl(dataUrl, 1200, 800, 0.8)
      } catch {}
      const res = await fetch('/api/admin/upload-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filename: file.name, dataUrl }),
      })
      const data = await res.json()
      if (res.ok) {
        // add cache-busting to force fresh preview
        const busted =
          data.url + (data.url.includes('?') ? '&' : '?') + '__ts=' + Date.now()
        setter(busted)
        toast({ status: 'success', title: 'Image uploaded' })
      } else {
        toast({ status: 'error', title: data?.error || 'Upload failed' })
      }
    }
    reader.readAsDataURL(file)
  }

  async function compressImageDataUrl(
    srcDataUrl: string,
    maxW: number,
    maxH: number,
    quality: number
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
        resolve(canvas.toDataURL('image/jpeg', quality))
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

  const clamp = (v: number, min: number, max: number) =>
    Math.max(min, Math.min(max, v))

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
    const nx = clamp(
      dragState.current.startPosX + (dx / rect.width) * 100,
      0,
      100
    )
    const ny = clamp(
      dragState.current.startPosY + (dy / rect.height) * 100,
      0,
      100
    )
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

  return (
    <>
      <Heading size="sm">Hero</Heading>
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
          <Input
            value={hero.brand}
            onChange={(e) => setHero({ ...hero, brand: e.target.value })}
          />
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
              if (f) onUpload(f, (url) => setHero({ ...hero, avatarUrl: url }))
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
                borderColor="gray.300"
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
                    color="gray.400"
                    bg="gray.50"
                  >
                    <Text>No avatar</Text>
                  </Flex>
                )}
              </Box>
              <HStack mt={3} spacing={3}>
                <Button size="sm" onClick={resetAvatarTransform}>
                  Reset
                </Button>
                <Text fontSize="sm" color="gray.600">
                  X: {Math.round(hero.avatarTransform.x)}% · Y:{' '}
                  {Math.round(hero.avatarTransform.y)}% · Scale:{' '}
                  {hero.avatarTransform.scale.toFixed(2)}
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
          <Input
            value={hero.phone}
            onChange={(e) => setHero({ ...hero, phone: e.target.value })}
          />
        </FormControl>
        <FormControl>
          <FormLabel>Email</FormLabel>
          <Input
            value={hero.email}
            onChange={(e) => setHero({ ...hero, email: e.target.value })}
          />
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
            <Text as="span" color="gray.500" fontWeight="normal" fontSize="xs" ml={2}>
              shown under avatar on home · blank = auto-fill from CV
            </Text>
          </FormLabel>
          <SimpleGrid columns={[1, 3]} gap={3}>
            <Input
              placeholder={
                ccAuto.label
                  ? `auto: ${ccAuto.label}`
                  : 'Top label (e.g. currently coding)'
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
                ccAuto.project
                  ? `auto: ${ccAuto.project}`
                  : 'Project line (e.g. WeGreen AI · COT)'
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
                ccAuto.note
                  ? `auto: ${ccAuto.note}`
                  : 'Footer note (e.g. self-taught · since 2022)'
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
          <Text mt={2} fontSize="xs" color="gray.500">
            Auto-derived now:{' '}
            <Text as="span" color="gray.700" fontFamily="mono">
              {ccAuto.label || '—'}
            </Text>
            {' · '}
            <Text as="span" color="gray.700" fontFamily="mono">
              {ccAuto.project || '—'}
            </Text>
            {' · '}
            <Text as="span" color="gray.700" fontFamily="mono">
              {ccAuto.note || '—'}
            </Text>
          </Text>
        </FormControl>
      </SimpleGrid>

      <Heading size="sm" mt={6}>
        Socials
      </Heading>
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
            onChange={(e) =>
              setSocials({ ...socials, linkedin: e.target.value })
            }
          />
        </FormControl>
        <FormControl>
          <FormLabel>WhatsApp</FormLabel>
          <Input
            value={socials.whatsapp}
            onChange={(e) =>
              setSocials({ ...socials, whatsapp: e.target.value })
            }
          />
        </FormControl>
      </SimpleGrid>

      <Heading size="sm" mt={6}>
        Brands
      </Heading>
      <Table variant="simple">
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
                  accept="image/*"
                  onChange={(e) => {
                    const input = e.target as HTMLInputElement
                    const f = input.files?.[0]
                    if (f)
                      onUpload(f, (url) => {
                        const arr = [...brands]
                        arr[idx] = { ...arr[idx], image: url }
                        setBrands(arr)
                      })
                    // clear to allow re-selecting same file
                    input.value = ''
                  }}
                />
              </Td>
              <Td>
                <IconButton
                  aria-label="delete"
                  icon={<DeleteIcon />}
                  onClick={() => setBrands(brands.filter((_, i) => i !== idx))}
                />
              </Td>
            </Tr>
          ))}
        </Tbody>
      </Table>
      <Button
        leftIcon={<AddIcon />}
        onClick={() =>
          setBrands([...brands, { name: '', href: '', image: '' }])
        }
      >
        Add Brand
      </Button>

      <Heading size="sm" mt={6}>
        Quick Access
      </Heading>
      <Table variant="simple">
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
                  onChange={(e) => {
                    const arr = [...quickAccess]
                    arr[idx] = { ...arr[idx], url: e.target.value }
                    setQuick(arr)
                  }}
                />
              </Td>
              <Td>
                <IconButton
                  aria-label="delete"
                  icon={<DeleteIcon />}
                  onClick={() =>
                    setQuick(quickAccess.filter((_, i) => i !== idx))
                  }
                />
              </Td>
            </Tr>
          ))}
        </Tbody>
      </Table>
      <Button
        leftIcon={<AddIcon />}
        onClick={() => setQuick([...quickAccess, { label: '', url: '' }])}
      >
        Add Quick Link
      </Button>

      <Heading size="sm" mt={6}>
        Photos
      </Heading>
      <Table variant="simple">
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
              onDragStart={(e) =>
                e.dataTransfer.setData('text/plain', String(idx))
              }
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
                  accept="image/*"
                  onChange={(e) => {
                    const input = e.target as HTMLInputElement
                    const f = input.files?.[0]
                    if (f)
                      onUpload(f, (url) => {
                        const arr = [...photos]
                        arr[idx] = { ...arr[idx], url }
                        setPhotos(arr)
                      })
                    // clear to allow re-selecting same file
                    input.value = ''
                  }}
                />
              </Td>
              <Td>
                <HStack>
                  <Button
                    size="sm"
                    onClick={() => {
                      if (idx === 0) return
                      const arr = [...photos]
                      const t = arr[idx - 1]
                      arr[idx - 1] = arr[idx]
                      arr[idx] = t
                      setPhotos(arr)
                    }}
                  >
                    ↑
                  </Button>
                  <Button
                    size="sm"
                    onClick={() => {
                      if (idx === photos.length - 1) return
                      const arr = [...photos]
                      const t = arr[idx + 1]
                      arr[idx + 1] = arr[idx]
                      arr[idx] = t
                      setPhotos(arr)
                    }}
                  >
                    ↓
                  </Button>
                </HStack>
              </Td>
              <Td>
                <IconButton
                  aria-label="delete"
                  icon={<DeleteIcon />}
                  onClick={() => setPhotos(photos.filter((_, i) => i !== idx))}
                />
              </Td>
            </Tr>
          ))}
        </Tbody>
      </Table>
      <Button
        leftIcon={<AddIcon />}
        onClick={() =>
          setPhotos([
            ...(photos || []),
            { url: '', describe: '', redirectTo: '', visible: true },
          ])
        }
      >
        Add Photo
      </Button>

      {/* ── Section visibility ─────────────────────────────────────── */}
      <Heading size="sm" mt={8}>
        Visibility
      </Heading>
      <Text fontSize="xs" color="gray.500" mt={1} mb={3}>
        Toggle which [NN] rows appear on the home page. Hiding a row also
        removes its anchor + scroll target — the numbering on the rest of
        the page stays the same because labels are static.
      </Text>
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
              borderColor={visible ? 'green.300' : 'gray.200'}
              bg={visible ? 'green.50' : 'gray.50'}
              _dark={{
                borderColor: visible ? 'green.700' : 'gray.700',
                bg: visible ? 'rgba(34,197,94,0.08)' : 'rgba(255,255,255,0.02)',
              }}
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
                <Text fontSize="xs" color="gray.500" mt={0.5}>
                  {hint}
                </Text>
              </Box>
            </Flex>
          )
        })}
      </SimpleGrid>

      {/* ── Contact panel copy ─────────────────────────────────────── */}
      <Heading size="sm" mt={8}>
        Contact panel
      </Heading>
      <Text fontSize="xs" color="gray.500" mt={1} mb={3}>
        Headings + reasons-dropdown options shown on the home contact
        section. Leave a field blank to use the built-in default
        (heading = brand name, blurb = &ldquo;I usually reply within 24 hours.&rdquo;,
        eyebrow = &ldquo;▸ Reach me&rdquo;). Reasons default to the original
        six when the list is empty.
      </Text>
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
          <Text as="span" color="gray.500" fontWeight="normal" fontSize="xs" ml={2}>
            empty list = use defaults
          </Text>
        </FormLabel>
        <Wrap spacing={2} mb={3}>
          {contact.reasons.length === 0 && (
            <Text fontSize="xs" color="gray.500" fontStyle="italic">
              No custom reasons — the dropdown will show:{' '}
              <strong>{DEFAULT_CONTACT_REASONS.join(', ')}</strong>
            </Text>
          )}
          {contact.reasons.map((r, idx) => (
            <WrapItem key={`${r}-${idx}`}>
              <Tag size="md" colorScheme="purple" borderRadius="full" variant="subtle">
                <TagLabel>{r}</TagLabel>
                <TagCloseButton onClick={() => removeReason(idx)} />
              </Tag>
            </WrapItem>
          ))}
        </Wrap>
        <HStack>
          <Input
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
          <Button onClick={addReason} leftIcon={<AddIcon />}>
            Add
          </Button>
          <Button variant="outline" onClick={restoreDefaultReasons}>
            Restore defaults
          </Button>
        </HStack>
      </Box>

      <Divider my={6} />

      <HStack mt={6}>
        <Button
          colorScheme="blue"
          onClick={() => {
            for (const p of photos) {
              if (p.url && !validateUrl(p.url)) {
                toast({ status: 'error', title: 'Invalid photo URL' })
                return
              }
              if (p.redirectTo && !validateUrl(p.redirectTo)) {
                toast({ status: 'error', title: 'Invalid link URL' })
                return
              }
            }
            save()
          }}
        >
          Save All
        </Button>
      </HStack>
    </>
  )
}
