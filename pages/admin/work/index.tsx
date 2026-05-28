import React, { useEffect, useState } from 'react'
import {
  Box,
  Button,
  Flex,
  Heading,
  Text,
  Table,
  Thead,
  Tbody,
  Tr,
  Th,
  Td,
  useToast,
  IconButton,
  Badge,
  HStack,
} from '@chakra-ui/react'
import { useRouter } from 'next/router'
import { DeleteIcon, EditIcon, AddIcon } from '@chakra-ui/icons'
import HeaderFooter from '../../../layout/HeaderFooter'
import CustomHead from '../../../components/General-UI/CustomHead'

type Item = {
  slug: string
  frontmatter: {
    title?: string
    period?: string
    status?: 'live' | 'archived' | 'case-study'
    featured?: boolean
    tech?: string[]
  }
  mtime: number
}

export default function AdminWorkIndex() {
  const router = useRouter()
  const toast = useToast()
  const [items, setItems] = useState<Item[]>([])
  const [loading, setLoading] = useState(true)

  const load = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/admin/work')
      if (res.status === 401) {
        router.replace('/admin/login?from=/admin/work')
        return
      }
      const data = await res.json()
      setItems(data.items || [])
    } catch {
      toast({ status: 'error', title: 'Failed to load case studies' })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const del = async (slug: string) => {
    if (!confirm(`Delete "${slug}"? A snapshot will be saved first.`)) return
    const res = await fetch(`/api/admin/work?slug=${encodeURIComponent(slug)}`, {
      method: 'DELETE',
    })
    if (res.ok) {
      toast({ status: 'success', title: 'Deleted (snapshot saved)' })
      load()
    } else {
      toast({ status: 'error', title: 'Delete failed' })
    }
  }

  return (
    <>
      <CustomHead title="Admin · Work" />
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
                [admin] work
              </Text>
              <Heading size="lg" fontWeight={500} letterSpacing="-0.02em">
                Case Studies
              </Heading>
            </Box>
            <HStack>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => router.push('/admin/dashboard')}
              >
                ← Dashboard
              </Button>
              <Button
                colorScheme="purple"
                size="sm"
                leftIcon={<AddIcon />}
                onClick={() => router.push('/admin/work/edit')}
              >
                New Case Study
              </Button>
            </HStack>
          </Flex>

          <Box border="1px solid" borderColor="page.border" borderRadius="lg" overflow="hidden">
            <Table size="sm" variant="simple">
              <Thead>
                <Tr>
                  <Th>Title</Th>
                  <Th>Slug</Th>
                  <Th>Period</Th>
                  <Th>Tech</Th>
                  <Th>Status</Th>
                  <Th width="100px">Actions</Th>
                </Tr>
              </Thead>
              <Tbody>
                {loading ? (
                  <Tr>
                    <Td colSpan={6} textAlign="center" py={6}>
                      Loading…
                    </Td>
                  </Tr>
                ) : items.length === 0 ? (
                  <Tr>
                    <Td colSpan={6} textAlign="center" py={6} color="gray.500">
                      No case studies yet. Click <b>New Case Study</b> to create one.
                    </Td>
                  </Tr>
                ) : (
                  items.map((it) => (
                    <Tr key={it.slug}>
                      <Td fontWeight={500}>
                        {it.frontmatter.title || '—'}
                        {it.frontmatter.featured && (
                          <Badge ml={2} colorScheme="purple" variant="subtle">
                            featured
                          </Badge>
                        )}
                      </Td>
                      <Td fontFamily="var(--font-geist-mono), monospace" fontSize="12px">
                        {it.slug}
                      </Td>
                      <Td fontSize="13px">{it.frontmatter.period || '—'}</Td>
                      <Td fontSize="12px" color="gray.500">
                        {(it.frontmatter.tech || []).slice(0, 3).join(' · ')}
                      </Td>
                      <Td>
                        <Badge
                          colorScheme={
                            it.frontmatter.status === 'live'
                              ? 'green'
                              : it.frontmatter.status === 'archived'
                                ? 'gray'
                                : 'blue'
                          }
                          variant="subtle"
                        >
                          {it.frontmatter.status || 'case-study'}
                        </Badge>
                      </Td>
                      <Td>
                        <HStack spacing={1}>
                          <IconButton
                            size="xs"
                            aria-label="Edit"
                            icon={<EditIcon />}
                            variant="ghost"
                            onClick={() =>
                              router.push(`/admin/work/edit?slug=${encodeURIComponent(it.slug)}`)
                            }
                          />
                          <IconButton
                            size="xs"
                            aria-label="Delete"
                            icon={<DeleteIcon />}
                            variant="ghost"
                            colorScheme="red"
                            onClick={() => del(it.slug)}
                          />
                        </HStack>
                      </Td>
                    </Tr>
                  ))
                )}
              </Tbody>
            </Table>
          </Box>
        </Box>
      </HeaderFooter>
    </>
  )
}
