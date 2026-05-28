import React, { useEffect, useState } from 'react'
import {
  Box,
  Button,
  Flex,
  Heading,
  HStack,
  Input,
  Text,
  Textarea,
  useToast,
  FormControl,
  FormLabel,
  Checkbox,
  SimpleGrid,
} from '@chakra-ui/react'
import { useRouter } from 'next/router'
import HeaderFooter from '../../../layout/HeaderFooter'
import CustomHead from '../../../components/General-UI/CustomHead'

type Frontmatter = {
  title: string
  description: string
  date: string
  tags: string[]
  draft: boolean
}

const todayISO = () => new Date().toISOString().slice(0, 10)

export default function AdminBlogEdit() {
  const router = useRouter()
  const toast = useToast()
  const initialSlug = (router.query.slug as string | undefined) || ''

  const [slug, setSlug] = useState(initialSlug)
  const [fm, setFm] = useState<Frontmatter>({
    title: '',
    description: '',
    date: todayISO(),
    tags: [],
    draft: true,
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

          <FormControl>
            <FormLabel fontSize="13px">Body (MDX)</FormLabel>
            <Textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              minH="500px"
              fontFamily="var(--font-geist-mono), monospace"
              fontSize="14px"
              placeholder={`## Heading\n\nYour content in **Markdown** + MDX. Code blocks get syntax highlighting:\n\n\`\`\`tsx\nconst hello = 'world'\n\`\`\``}
            />
          </FormControl>
        </Box>
      </HeaderFooter>
    </>
  )
}
