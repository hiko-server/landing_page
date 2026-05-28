import React, { useEffect, useMemo, useState } from 'react'
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
  SimpleGrid,
} from '@chakra-ui/react'
import { useRouter } from 'next/router'
import dynamic from 'next/dynamic'
import HeaderFooter from '../../layout/HeaderFooter'
import CustomHead from '../../components/General-UI/CustomHead'

// TipTap pulls in ProseMirror modules that touch the DOM during init; load
// client-side only so SSR stays stable.
const RichEditor = dynamic(() => import('./RichEditor'), { ssr: false })

type PageName = 'now' | 'uses'

type Frontmatter = {
  title: string
  description: string
  updated: string
}

const todayISO = () => new Date().toISOString().slice(0, 10)

// Single-file MDX editor used by /admin/now and /admin/uses. The two pages
// share the same shape (one .mdx file, no slug list) so the editor is just a
// thin wrapper that picks which file to load.
export default function PageEditor({ name }: { name: PageName }) {
  const router = useRouter()
  const toast = useToast()
  const label = name.toUpperCase()

  const [fm, setFm] = useState<Frontmatter>({ title: '', description: '', updated: todayISO() })
  const [body, setBody] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let alive = true
    ;(async () => {
      try {
        const res = await fetch(`/api/admin/page?name=${name}`)
        if (res.status === 401) {
          router.replace(`/admin/login?from=/admin/${name}`)
          return
        }
        if (!res.ok) throw new Error()
        const data = await res.json()
        if (!alive) return
        // gray-matter parses YAML dates into JS Date objects; coerce to string.
        const updatedRaw = data.frontmatter?.updated as unknown
        const updated =
          updatedRaw instanceof Date
            ? updatedRaw.toISOString().slice(0, 10)
            : updatedRaw
              ? String(updatedRaw).slice(0, 10)
              : todayISO()
        setFm({
          title: String(data.frontmatter?.title ?? label),
          description: String(data.frontmatter?.description ?? ''),
          updated,
        })
        setBody(String(data.body ?? ''))
      } catch {
        toast({ status: 'error', title: `Failed to load /${name}` })
      } finally {
        if (alive) setLoading(false)
      }
    })()
    return () => {
      alive = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [name])

  const save = async () => {
    if (!fm.title.trim()) {
      toast({ status: 'error', title: 'Title is required' })
      return
    }
    const res = await fetch('/api/admin/page', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name,
        frontmatter: {
          title: fm.title,
          description: fm.description || undefined,
          updated: fm.updated,
        },
        body,
      }),
    })
    if (res.ok) {
      toast({ status: 'success', title: 'Saved (snapshot taken)' })
    } else {
      const data = await res.json().catch(() => ({}))
      toast({ status: 'error', title: data?.error || 'Save failed' })
    }
  }

  const publicHref = useMemo(() => `/${name}`, [name])

  return (
    <>
      <CustomHead title={`Admin · /${name}`} />
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
                [admin] page · {name}
              </Text>
              <Heading size="lg" fontWeight={500} letterSpacing="-0.02em">
                Edit /{name}
              </Heading>
            </Box>
            <HStack>
              <Button variant="ghost" size="sm" onClick={() => router.push(publicHref)}>
                View live ↗
              </Button>
              <Button variant="ghost" size="sm" onClick={() => router.push('/admin')}>
                ← Admin
              </Button>
              <Button colorScheme="purple" size="sm" onClick={save} isDisabled={loading}>
                Save
              </Button>
            </HStack>
          </Flex>

          <SimpleGrid columns={[1, 2]} spacing={4} mb={4}>
            <FormControl>
              <FormLabel fontSize="13px">Title</FormLabel>
              <Input value={fm.title} onChange={(e) => setFm({ ...fm, title: e.target.value })} />
            </FormControl>
            <FormControl>
              <FormLabel fontSize="13px">Updated</FormLabel>
              <Input
                type="date"
                value={fm.updated}
                onChange={(e) => setFm({ ...fm, updated: e.target.value })}
              />
            </FormControl>
          </SimpleGrid>

          <FormControl mb={4}>
            <FormLabel fontSize="13px">Description</FormLabel>
            <Input
              value={fm.description}
              onChange={(e) => setFm({ ...fm, description: e.target.value })}
              placeholder="One-line summary shown in OG card + meta description"
            />
          </FormControl>

          <FormControl>
            <FormLabel fontSize="13px">Body</FormLabel>
            <RichEditor
              value={body}
              onChange={setBody}
              minH="520px"
              placeholder="Write in Markdown + MDX. Drag, drop or paste images. Switch to MDX tab for raw JSX."
            />
          </FormControl>
        </Box>
      </HeaderFooter>
    </>
  )
}
