import React, { useEffect, useId, useMemo, useState } from 'react'
import {
  Box,
  Button,
  Flex,
  FormControl,
  FormLabel,
  IconButton,
  Input,
  List,
  ListItem,
  Spinner,
  Switch,
  Text,
  Textarea,
} from '@chakra-ui/react'
import { DeleteIcon } from '@chakra-ui/icons'
import { HOME_LIMITS, isRepoName } from '../../../lib/homeShape'
import SortableList, { SortableHandle } from '../shell/SortableList'
import { MONO, inputProps } from '../shell/ui'
import { blurbRemaining, moveItem, newId, type OpenSourceForm } from './homeForm'
import { useUndoableRemove, type SectionProps } from './ImageCards'

type RepoChoice = { name: string; description: string; language: string; stars: number }

type LoadState = 'loading' | 'ready' | 'unavailable'

function parseRepos(body: unknown): { repos: RepoChoice[]; available: boolean } {
  const b = body as { repos?: unknown; available?: unknown } | unknown[] | null
  const list = Array.isArray(b) ? b : Array.isArray(b?.repos) ? (b?.repos as unknown[]) : []
  const repos = list
    .map((r) => (r && typeof r === 'object' ? (r as Record<string, unknown>) : {}))
    .filter((r) => typeof r.name === 'string' && r.name)
    .map((r) => ({
      name: String(r.name),
      description: typeof r.description === 'string' ? r.description : '',
      language: typeof r.language === 'string' ? r.language : '',
      stars: typeof r.stargazers_count === 'number' ? r.stargazers_count : 0,
    }))
  const available = Array.isArray(b) ? true : b?.available !== false
  return { repos, available }
}

/**
 * Featured repositories for the home [02] section: pick from the owner's
 * public repos (GET /api/github/top-repos?all=1) or type a name when GitHub
 * is unreachable; reorder by dragging; optional blurb (≤140). Plus the
 * vanity-stats toggle.
 */
export default function OpenSourceSection({ value, onChange }: SectionProps<OpenSourceForm>) {
  const [state, setState] = useState<LoadState>('loading')
  const [repos, setRepos] = useState<RepoChoice[]>([])
  const [query, setQuery] = useState('')
  const searchId = useId()
  const listId = useId()
  const statsId = useId()

  useEffect(() => {
    let alive = true
    fetch('/api/github/top-repos?all=1', { credentials: 'same-origin', cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((body) => {
        if (!alive) return
        const parsed = parseRepos(body)
        setRepos(parsed.repos)
        setState(parsed.available ? 'ready' : 'unavailable')
      })
      .catch(() => alive && setState('unavailable'))
    return () => {
      alive = false
    }
  }, [])

  const setFeatured = (update: (prev: OpenSourceForm['featured']) => OpenSourceForm['featured']) =>
    onChange((prev) => ({ ...prev, featured: update(prev.featured) }))
  const removeFeatured = useUndoableRemove<OpenSourceForm['featured'][number]>(
    (next) => onChange((prev) => ({ ...prev, featured: typeof next === 'function' ? next(prev.featured) : next })),
    'repo',
  )

  const chosen = useMemo(() => new Set(value.featured.map((f) => f.name.toLowerCase())), [value.featured])
  const q = query.trim().toLowerCase()
  const matches = repos
    .filter((r) => !chosen.has(r.name.toLowerCase()))
    .filter((r) => !q || r.name.toLowerCase().includes(q) || r.description.toLowerCase().includes(q) || r.language.toLowerCase().includes(q))
    .slice(0, 8)
  const typed = query.trim()
  const canAddTyped = isRepoName(typed) && !chosen.has(typed.toLowerCase()) && !repos.some((r) => r.name.toLowerCase() === typed.toLowerCase())
  const full = value.featured.length >= HOME_LIMITS.featuredMax

  const add = (name: string) => {
    if (full || chosen.has(name.toLowerCase())) return
    setFeatured((prev) => [...prev, { _id: newId(), name, blurb: '' }])
    setQuery('')
  }

  return (
    <Box>
      <FormControl>
        <FormLabel htmlFor={searchId} fontSize="xs" color="page.fg-secondary" mb={1}>
          Add a repository
        </FormLabel>
        <Input
          id={searchId}
          size="sm"
          {...inputProps}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key !== 'Enter' || e.nativeEvent.isComposing) return
            e.preventDefault()
            if (matches[0]) add(matches[0].name)
            else if (canAddTyped) add(typed)
          }}
          placeholder={state === 'unavailable' ? 'GitHub is unreachable — type a repository name' : 'Search your repositories'}
          aria-controls={listId}
          isDisabled={full}
        />
      </FormControl>
      <Text mt={1} fontSize="xs" color="page.fg-secondary" role="status">
        {full
          ? `Up to ${HOME_LIMITS.featuredMax} featured repositories.`
          : state === 'loading'
            ? 'Loading your repositories…'
            : state === 'unavailable'
              ? 'Couldn’t reach GitHub. Type the exact repository name and press Enter.'
              : `${repos.length} public repositories. Featured ones come first on the home page, then the rest by stars and recency.`}
      </Text>
      {state === 'loading' ? <Spinner size="sm" mt={2} /> : null}
      {(matches.length || canAddTyped) && !full ? (
        <List id={listId} mt={2} border="1px solid" borderColor="page.border" borderRadius="md" maxH="260px" overflowY="auto" aria-label="Matching repositories">
          {matches.map((r) => (
            <ListItem key={r.name} borderBottom="1px solid" borderColor="page.border" _last={{ borderBottom: 'none' }}>
              <Button
                variant="ghost"
                w="100%"
                h="auto"
                py={2}
                px={3}
                justifyContent="flex-start"
                textAlign="left"
                borderRadius={0}
                onClick={() => add(r.name)}
                _hover={{ bg: 'page.bg-overlay' }}
              >
                <Box minW={0}>
                  <Text fontSize="sm" fontWeight={600} noOfLines={1}>
                    {r.name}
                    <Text as="span" ml={2} fontFamily={MONO} fontSize="10px" color="page.fg-secondary" fontWeight={400} className="tnum">
                      {[r.language, `★ ${r.stars}`].filter(Boolean).join(' · ')}
                    </Text>
                  </Text>
                  {r.description ? (
                    <Text fontSize="xs" color="page.fg-secondary" noOfLines={1} fontWeight={400} whiteSpace="normal">
                      {r.description}
                    </Text>
                  ) : null}
                </Box>
              </Button>
            </ListItem>
          ))}
          {canAddTyped ? (
            <ListItem>
              <Button variant="ghost" w="100%" justifyContent="flex-start" borderRadius={0} size="sm" onClick={() => add(typed)}>
                Add “{typed}”
              </Button>
            </ListItem>
          ) : null}
        </List>
      ) : null}

      <Box mt={4}>
        {value.featured.length === 0 ? (
          <Text fontSize="sm" color="page.fg-secondary">
            Nothing featured — the home page shows your repositories by stars and recency.
          </Text>
        ) : (
          <SortableList
            items={value.featured}
            getId={(f) => f._id}
            itemNoun="repository"
            ariaLabel="Featured repositories, in display order"
            spacing={2}
            onReorder={(from, to) => setFeatured((prev) => moveItem(prev, from, to))}
            renderItem={(f, { index }) => {
              const left = blurbRemaining(f.blurb)
              return (
                <Flex gap={2} p={2.5} border="1px solid" borderColor="page.border" borderRadius="lg" bg="page.bg" align="flex-start">
                  <SortableHandle label={`Reorder ${f.name}`} />
                  <Box flex={1} minW={0}>
                    <Text fontSize="sm" fontWeight={600} noOfLines={1} pt={1}>
                      {f.name}
                    </Text>
                    <FormControl mt={1.5} isInvalid={left < 0}>
                      <FormLabel srOnly>Blurb for {f.name}</FormLabel>
                      <Textarea
                        size="sm"
                        rows={2}
                        {...inputProps}
                        value={f.blurb}
                        placeholder="Optional one-liner shown instead of the GitHub description"
                        onChange={(e) => setFeatured((prev) => prev.map((x) => (x._id === f._id ? { ...x, blurb: e.target.value } : x)))}
                      />
                      <Text mt={1} fontSize="10px" fontFamily={MONO} color={left < 0 ? 'red.600' : 'page.fg-secondary'} _dark={left < 0 ? { color: 'red.300' } : undefined} className="tnum" textAlign="right">
                        {left} characters left
                      </Text>
                    </FormControl>
                  </Box>
                  <IconButton
                    aria-label={`Remove ${f.name}`}
                    size="sm"
                    variant="ghost"
                    color="page.fg-secondary"
                    _hover={{ color: 'red.500', bg: 'page.bg-overlay' }}
                    icon={<DeleteIcon />}
                    onClick={() => removeFeatured(value.featured, index)}
                  />
                </Flex>
              )
            }}
          />
        )}
      </Box>

      <Flex align="center" justify="space-between" gap={4} mt={5} p={3} border="1px solid" borderColor="page.border" borderRadius="lg">
        <Box>
          <Text as="label" htmlFor={statsId} fontSize="sm" fontWeight={600}>
            Show star and fork totals
          </Text>
          <Text fontSize="xs" color="page.fg-secondary">
            Off: the section leads with what the projects do, not popularity counts.
          </Text>
        </Box>
        <Switch
          id={statsId}
          colorScheme="purple"
          isChecked={value.showVanityStats}
          onChange={(e) => onChange((prev) => ({ ...prev, showVanityStats: e.target.checked }))}
        />
      </Flex>
    </Box>
  )
}
