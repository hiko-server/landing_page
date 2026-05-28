import React, { useEffect, useRef, useState } from 'react'
import {
  Box,
  Button,
  Flex,
  Heading,
  HStack,
  Input,
  Text,
  useToast,
  FormControl,
  FormLabel,
  Checkbox,
  SimpleGrid,
  Select,
  Image as ChakraImage,
} from '@chakra-ui/react'
import { useRouter } from 'next/router'
import dynamic from 'next/dynamic'
import HeaderFooter from '../../../layout/HeaderFooter'
import CustomHead from '../../../components/General-UI/CustomHead'

const RichEditor = dynamic(() => import('../../../components/Admin/RichEditor'), { ssr: false })

type Frontmatter = {
  title: string
  description: string
  role: string
  period: string
  tech: string[]
  status: 'live' | 'case-study' | 'archived'
  featured: boolean
  link: string
  repo: string
  cover?: string
}

export default function AdminWorkEdit() {
  const router = useRouter()
  const toast = useToast()
  const initialSlug = (router.query.slug as string | undefined) || ''

  const coverInputRef = useRef<HTMLInputElement>(null)
  const [slug, setSlug] = useState(initialSlug)
  const [fm, setFm] = useState<Frontmatter>({
    title: '',
    description: '',
    role: '',
    period: '',
    tech: [],
    status: 'case-study',
    featured: false,
    link: '',
    repo: '',
    cover: '',
  })
  const [body, setBody] = useState('')
  const [loading, setLoading] = useState(Boolean(initialSlug))

  useEffect(() => {
    if (!router.isReady || !initialSlug) return
    ;(async () => {
      try {
        const res = await fetch(`/api/admin/work?slug=${encodeURIComponent(initialSlug)}`)
        if (res.status === 401) {
          router.replace(`/admin/login?from=/admin/work/edit?slug=${initialSlug}`)
          return
        }
        if (!res.ok) throw new Error()
        const data = await res.json()
        setSlug(data.slug)
        setFm({
          title: data.frontmatter.title || '',
          description: data.frontmatter.description || '',
          role: data.frontmatter.role || '',
          period: data.frontmatter.period || '',
          tech: data.frontmatter.tech || [],
          status: data.frontmatter.status || 'case-study',
          featured: Boolean(data.frontmatter.featured),
          link: data.frontmatter.link || '',
          repo: data.frontmatter.repo || '',
          cover: data.frontmatter.cover || '',
        })
        setBody(data.body || '')
      } catch {
        toast({ status: 'error', title: 'Failed to load case study' })
      } finally {
        setLoading(false)
      }
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router.isReady, initialSlug])

  const save = async () => {
    if (!/^[a-z0-9][a-z0-9-_]*$/.test(slug)) {
      toast({ status: 'error', title: 'Slug must be a-z, 0-9, -, _' })
      return
    }
    if (!fm.title.trim()) {
      toast({ status: 'error', title: 'Title is required' })
      return
    }
    const res = await fetch('/api/admin/work', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        slug,
        frontmatter: {
          title: fm.title,
          description: fm.description || undefined,
          role: fm.role || undefined,
          period: fm.period || undefined,
          tech: fm.tech.length ? fm.tech : undefined,
          status: fm.status,
          featured: fm.featured || undefined,
          link: fm.link || undefined,
          repo: fm.repo || undefined,
          cover: fm.cover || undefined,
        },
        body,
      }),
    })
    if (res.ok) {
      toast({ status: 'success', title: 'Saved (snapshot taken)' })
      router.replace(`/admin/work/edit?slug=${encodeURIComponent(slug)}`)
    } else {
      const data = await res.json().catch(() => ({}))
      toast({ status: 'error', title: data?.error || 'Save failed' })
    }
  }

  return (
    <>
      <CustomHead title={initialSlug ? `Admin · Edit ${initialSlug}` : 'Admin · New Case Study'} />
      <HeaderFooter isMobile={false}>
        <Box maxW="var(--container-content)" mx="auto" px={[4, 6, 8]} py={[6, 10]}>
          <Flex justify="space-between" align="center" mb={6} flexWrap="wrap" gap={3}>
            <Box>
              <Text
                fontFamily="var(--font-geist-mono), monospace"
                fontSize="11px"
                color="gray.500"
                letterSpacing="0.12em"
                textTransform="uppercase"
              >
                [admin] work · {initialSlug ? 'edit' : 'new'}
              </Text>
              <Heading size="lg" fontWeight={500} letterSpacing="-0.02em">
                {initialSlug ? `Edit "${initialSlug}"` : 'New Case Study'}
              </Heading>
            </Box>
            <HStack>
              <Button variant="ghost" size="sm" onClick={() => router.push('/admin/work')}>
                ← All case studies
              </Button>
              <Button colorScheme="purple" size="sm" onClick={save} isDisabled={loading}>
                Save
              </Button>
            </HStack>
          </Flex>

          <SimpleGrid columns={[1, 2]} spacing={4} mb={4}>
            <FormControl>
              <FormLabel fontSize="13px">Slug</FormLabel>
              <Input
                value={slug}
                placeholder="wegreen-ai"
                onChange={(e) => setSlug(e.target.value)}
                isReadOnly={!!initialSlug}
                fontFamily="var(--font-geist-mono), monospace"
                fontSize="14px"
              />
            </FormControl>
            <FormControl>
              <FormLabel fontSize="13px">Period</FormLabel>
              <Input
                value={fm.period}
                onChange={(e) => setFm({ ...fm, period: e.target.value })}
                placeholder="2024 — Now"
              />
            </FormControl>
          </SimpleGrid>

          <FormControl mb={4}>
            <FormLabel fontSize="13px">Title</FormLabel>
            <Input value={fm.title} onChange={(e) => setFm({ ...fm, title: e.target.value })} />
          </FormControl>

          <FormControl mb={4}>
            <FormLabel fontSize="13px">Description</FormLabel>
            <Input
              value={fm.description}
              onChange={(e) => setFm({ ...fm, description: e.target.value })}
              placeholder="One-line summary of the project"
            />
          </FormControl>

          <SimpleGrid columns={[1, 2]} spacing={4} mb={4}>
            <FormControl>
              <FormLabel fontSize="13px">Role</FormLabel>
              <Input
                value={fm.role}
                onChange={(e) => setFm({ ...fm, role: e.target.value })}
                placeholder="Co-founder / Engineer"
              />
            </FormControl>
            <FormControl>
              <FormLabel fontSize="13px">Status</FormLabel>
              <Select
                value={fm.status}
                onChange={(e) =>
                  setFm({ ...fm, status: e.target.value as Frontmatter['status'] })
                }
              >
                <option value="case-study">case-study</option>
                <option value="live">live</option>
                <option value="archived">archived</option>
              </Select>
            </FormControl>
          </SimpleGrid>

          <FormControl mb={4}>
            <FormLabel fontSize="13px">Tech (comma-separated)</FormLabel>
            <Input
              value={fm.tech.join(', ')}
              onChange={(e) =>
                setFm({
                  ...fm,
                  tech: e.target.value
                    .split(',')
                    .map((t) => t.trim())
                    .filter(Boolean),
                })
              }
              placeholder="Next.js, FastAPI, MongoDB"
            />
          </FormControl>

          <SimpleGrid columns={[1, 2]} spacing={4} mb={4}>
            <FormControl>
              <FormLabel fontSize="13px">Live URL</FormLabel>
              <Input
                value={fm.link}
                onChange={(e) => setFm({ ...fm, link: e.target.value })}
                placeholder="https://wegreen.ltd"
              />
            </FormControl>
            <FormControl>
              <FormLabel fontSize="13px">Repo URL</FormLabel>
              <Input
                value={fm.repo}
                onChange={(e) => setFm({ ...fm, repo: e.target.value })}
                placeholder="https://github.com/…"
              />
            </FormControl>
          </SimpleGrid>

          <FormControl mb={4}>
            <Checkbox
              isChecked={fm.featured}
              onChange={(e) => setFm({ ...fm, featured: e.target.checked })}
            >
              Featured (highlight in /work index)
            </Checkbox>
          </FormControl>

          <FormControl mb={4}>
            <FormLabel fontSize="13px">Cover image</FormLabel>
            <HStack spacing={3} align="flex-start">
              {fm.cover ? (
                <ChakraImage
                  src={fm.cover}
                  alt="cover"
                  maxH="120px"
                  borderRadius="6px"
                  border="1px solid"
                  borderColor="whiteAlpha.200"
                />
              ) : null}
              <Box flex="1">
                <Input
                  value={fm.cover || ''}
                  onChange={(e) => setFm({ ...fm, cover: e.target.value })}
                  placeholder="/uploads/cover.png or https://…"
                />
                <HStack mt={2} spacing={2}>
                  <Button size="xs" variant="outline" onClick={() => coverInputRef.current?.click()}>
                    Upload…
                  </Button>
                  {fm.cover ? (
                    <Button size="xs" variant="ghost" onClick={() => setFm({ ...fm, cover: '' })}>
                      Remove
                    </Button>
                  ) : null}
                </HStack>
                <Input
                  ref={coverInputRef}
                  type="file"
                  accept="image/*"
                  display="none"
                  onChange={async (e) => {
                    const file = e.target.files?.[0]
                    e.target.value = ''
                    if (!file) return
                    const reader = new FileReader()
                    reader.onload = async () => {
                      const res = await fetch('/api/admin/upload-image', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                          filename: `${Date.now()}-${file.name}`,
                          dataUrl: String(reader.result),
                        }),
                      })
                      if (!res.ok) {
                        toast({ status: 'error', title: 'Cover upload failed' })
                        return
                      }
                      const data = await res.json()
                      setFm((prev) => ({ ...prev, cover: data.url }))
                    }
                    reader.readAsDataURL(file)
                  }}
                />
              </Box>
            </HStack>
          </FormControl>

          <FormControl>
            <FormLabel fontSize="13px">Body</FormLabel>
            <RichEditor
              value={body}
              onChange={setBody}
              minH="500px"
              placeholder="Write in Markdown + MDX. Drag, drop or paste images. Switch to MDX tab for raw JSX."
            />
          </FormControl>
        </Box>
      </HeaderFooter>
    </>
  )
}
