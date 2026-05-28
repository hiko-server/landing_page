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
  date: string
  tags: string[]
  draft: boolean
  cover?: string
}

const todayISO = () => new Date().toISOString().slice(0, 10)

export default function AdminBlogEdit() {
  const router = useRouter()
  const toast = useToast()
  const initialSlug = (router.query.slug as string | undefined) || ''

  const coverInputRef = useRef<HTMLInputElement>(null)
  const [slug, setSlug] = useState(initialSlug)
  const [fm, setFm] = useState<Frontmatter>({
    title: '',
    description: '',
    date: todayISO(),
    tags: [],
    draft: true,
    cover: '',
  })
  const [body, setBody] = useState('')
  const [loading, setLoading] = useState(Boolean(initialSlug))

  // Load existing post when slug present in query
  useEffect(() => {
    if (!router.isReady || !initialSlug) return
    ;(async () => {
      try {
        const res = await fetch(`/api/admin/posts?slug=${encodeURIComponent(initialSlug)}`)
        if (res.status === 401) {
          router.replace(`/admin/login?from=/admin/blog/edit?slug=${initialSlug}`)
          return
        }
        if (!res.ok) throw new Error()
        const data = await res.json()
        setSlug(data.slug)
        setFm({
          title: data.frontmatter.title || '',
          description: data.frontmatter.description || '',
          date: String(data.frontmatter.date || todayISO()).slice(0, 10),
          tags: data.frontmatter.tags || [],
          draft: Boolean(data.frontmatter.draft),
          cover: data.frontmatter.cover || '',
        })
        setBody(data.body || '')
      } catch {
        toast({ status: 'error', title: 'Failed to load post' })
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
    const res = await fetch('/api/admin/posts', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        slug,
        frontmatter: {
          title: fm.title,
          description: fm.description || undefined,
          date: fm.date,
          tags: fm.tags.length ? fm.tags : undefined,
          draft: fm.draft || undefined,
          cover: fm.cover || undefined,
        },
        body,
      }),
    })
    if (res.ok) {
      toast({ status: 'success', title: 'Saved (snapshot taken)' })
      router.replace(`/admin/blog/edit?slug=${encodeURIComponent(slug)}`)
    } else {
      const data = await res.json().catch(() => ({}))
      toast({ status: 'error', title: data?.error || 'Save failed' })
    }
  }

  return (
    <>
      <CustomHead title={initialSlug ? `Admin · Edit ${initialSlug}` : 'Admin · New Post'} />
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
                [admin] blog · {initialSlug ? 'edit' : 'new'}
              </Text>
              <Heading size="lg" fontWeight={500} letterSpacing="-0.02em">
                {initialSlug ? `Edit "${initialSlug}"` : 'New Post'}
              </Heading>
            </Box>
            <HStack>
              <Button variant="ghost" size="sm" onClick={() => router.push('/admin/blog')}>
                ← All posts
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
                placeholder="my-first-post"
                onChange={(e) => setSlug(e.target.value)}
                isReadOnly={!!initialSlug}
                fontFamily="var(--font-geist-mono), monospace"
                fontSize="14px"
              />
            </FormControl>
            <FormControl>
              <FormLabel fontSize="13px">Date</FormLabel>
              <Input
                type="date"
                value={fm.date}
                onChange={(e) => setFm({ ...fm, date: e.target.value })}
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
              placeholder="One-line summary"
            />
          </FormControl>

          <SimpleGrid columns={[1, 2]} spacing={4} mb={4}>
            <FormControl>
              <FormLabel fontSize="13px">Tags (comma-separated)</FormLabel>
              <Input
                value={fm.tags.join(', ')}
                onChange={(e) =>
                  setFm({
                    ...fm,
                    tags: e.target.value
                      .split(',')
                      .map((t) => t.trim())
                      .filter(Boolean),
                  })
                }
                placeholder="engineering, ml, notes"
              />
            </FormControl>
            <FormControl display="flex" alignItems="end" pb={2}>
              <Checkbox
                isChecked={fm.draft}
                onChange={(e) => setFm({ ...fm, draft: e.target.checked })}
              >
                Draft (hidden from public list)
              </Checkbox>
            </FormControl>
          </SimpleGrid>

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
