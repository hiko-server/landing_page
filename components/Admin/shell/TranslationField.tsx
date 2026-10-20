import React, { useEffect, useId, useMemo, useState } from 'react'
import { useRouter } from 'next/router'
import NextLink from 'next/link'
import { Box, Button, Flex, FormControl, FormHelperText, FormLabel, Input, Link, Select, SimpleGrid, Text, useToast } from '@chakra-ui/react'
import { inputProps, MONO, outlineButtonProps, warnTextProps } from './ui'
import { loginHref, readJsonObject } from './http'
import type { TranslationForm } from './itemFrontmatter'
import { detectContentLang } from '../../../lib/toc'
import { cleanTranslationKeyInput, languageAutonym, translationLang, translationSlug, translationStatus, type AdminTranslatable } from '../../../lib/translations'
import { UI_LANGS } from '../../../lib/uiStrings'

/**
 * "Language & translations" — the one block of the post and case-study
 * editors for linked translations (F2, lib/translations):
 *
 *   - Language: detected from the title and body unless set (a bilingual or
 *     not-yet-translated body can be pinned to the language it stands for).
 *   - Translation key: the same key on every version of a piece links them
 *     — the language switch on each page, hreflang, the sitemap — and the
 *     indexes list the piece once (in English where it exists). Typed
 *     characters are kept to a–z, 0–9, - and _.
 *   - The other versions with that key, each with its language, title and
 *     draft state (the site links published versions only) and a link to
 *     its editor; a warning when two versions share a language (then
 *     nothing in the group is linked) or the key is used by nothing else.
 *   - "Create draft": copies the saved version — fields and body, nothing
 *     machine-translated — into a new draft in another language with the
 *     same key, then opens it. It never publishes anything.
 */

type Editor<F extends TranslationForm & { title: string; draft: boolean }> = {
  fm: F
  setFm: React.Dispatch<React.SetStateAction<F>>
  slug: string
  isNew: boolean
  dirty: boolean
  body: string
}

type Collection = 'blog' | 'work'

const ENDPOINT: Record<Collection, string> = { blog: '/api/admin/posts', work: '/api/admin/work' }
const NOUN: Record<Collection, string> = { blog: 'post', work: 'case study' }

type ListedItem = { slug?: unknown; lang?: unknown; frontmatter?: Record<string, unknown> }

function toTranslatable(i: ListedItem): AdminTranslatable | null {
  if (typeof i.slug !== 'string' || !i.slug) return null
  const fm = i.frontmatter || {}
  const title = typeof fm.title === 'string' && fm.title.trim() ? fm.title.trim() : i.slug
  return {
    slug: i.slug,
    lang: typeof i.lang === 'string' && i.lang ? i.lang : detectContentLang({ lang: fm.lang, title }),
    title,
    draft: fm.draft === true,
    translationKey: typeof fm.translationKey === 'string' ? fm.translationKey : '',
  }
}

const chipSx = {
  display: 'inline-flex',
  alignItems: 'center',
  px: 2,
  py: 0.5,
  borderRadius: 'pill',
  border: '1px solid',
  borderColor: 'page.border-strong',
  fontFamily: MONO,
  fontSize: '11px',
  lineHeight: 1.4,
  color: 'page.fg-secondary',
  whiteSpace: 'nowrap',
} as const

export default function TranslationField<F extends TranslationForm & { title: string; draft: boolean }>({ ed, collection }: { ed: Editor<F>; collection: Collection }) {
  const id = useId()
  const router = useRouter()
  const toast = useToast()
  const { fm, setFm } = ed
  const endpoint = ENDPOINT[collection]
  const noun = NOUN[collection]

  const [items, setItems] = useState<AdminTranslatable[] | null>(null)
  useEffect(() => {
    let alive = true
    fetch(endpoint, { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((data: { items?: ListedItem[] } | null) => {
        if (alive) setItems((data?.items || []).map(toTranslatable).filter((x): x is AdminTranslatable => !!x))
      })
      .catch(() => {
        if (alive) setItems([])
      })
    return () => {
      alive = false
    }
  }, [endpoint, ed.slug])

  const detected = useMemo(() => detectContentLang({ title: fm.title, body: ed.body }), [fm.title, ed.body])
  const lang = fm.lang.trim() || detected
  const status = useMemo(
    () => translationStatus({ slug: ed.slug, lang, translationKey: fm.translationKey }, items || []),
    [ed.slug, lang, fm.translationKey, items],
  )
  const missing = UI_LANGS.filter((l) => !status.languages.includes(l))
  const [target, setTarget] = useState<string>('')
  const createLang = missing.includes(target as (typeof UI_LANGS)[number]) ? target : missing[0] || ''
  const [creating, setCreating] = useState(false)

  const langOptions: Array<{ value: string; label: string }> = [
    { value: '', label: `Detect — ${languageAutonym(detected)}` },
    ...UI_LANGS.map((l) => ({ value: l, label: languageAutonym(l) })),
  ]
  if (fm.lang && !langOptions.some((o) => o.value === fm.lang)) langOptions.push({ value: fm.lang, label: fm.lang })

  const createDraft = async () => {
    if (!status.key || !createLang || ed.isNew || ed.dirty) return
    setCreating(true)
    try {
      const res = await fetch(`${endpoint}?slug=${encodeURIComponent(ed.slug)}`, { cache: 'no-store' })
      if (res.status === 401) {
        router.replace(loginHref(router.asPath))
        return
      }
      const source = await readJsonObject(res)
      if (!res.ok) throw new Error(source.error || `HTTP ${res.status}`)
      const frontmatter = { ...(source.frontmatter || {}), draft: true, lang: createLang, translationKey: status.key }
      const base = translationSlug(ed.slug, createLang)
      for (let n = 1; n <= 5; n++) {
        const slug = n === 1 ? base : `${base}-${n}`
        const put = await fetch(endpoint, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ slug, create: true, frontmatter, body: typeof source.body === 'string' ? source.body : '' }),
        })
        const data = await readJsonObject(put)
        if (put.status === 409 && data.code === 'SLUG_EXISTS') continue
        if (!put.ok) throw new Error(data.error || `HTTP ${put.status}`)
        toast({
          status: 'success',
          title: `${languageAutonym(createLang)} draft created`,
          description: `A copy of this ${noun} with the same key — translate it, then publish.`,
          position: 'bottom-right',
        })
        await router.push(`/admin/${collection}/edit?slug=${encodeURIComponent(slug)}`)
        return
      }
      throw new Error(`${base} and the next four slugs are taken`)
    } catch (e) {
      toast({ status: 'error', title: 'Could not create the translation', description: e instanceof Error ? e.message : String(e), position: 'bottom-right' })
    } finally {
      setCreating(false)
    }
  }

  const statusId = `${id}-status`
  const sameLanguage = status.members.filter((m) => m.sameLanguage)

  return (
    <Box as="fieldset" border="1px solid" borderColor="page.border" borderRadius="lg" p={{ base: 4, md: 5 }} m={0} data-translation-field="">
      <Box as="legend" px={2} fontFamily={MONO} fontSize="11px" letterSpacing="0.12em" textTransform="uppercase" color="page.fg-secondary">
        Language &amp; translations
      </Box>
      <Text fontSize="xs" color="page.fg-secondary" mb={4}>
        Give every language version of this {noun} the same key: each page then links to the others (a language switch, hreflang, the sitemap) and the
        lists show the {noun} once, in English where it exists.
      </Text>

      <SimpleGrid columns={{ base: 1, md: 2 }} spacing={4}>
        <FormControl>
          <FormLabel fontSize="13px" htmlFor={`${id}-lang`}>
            Language
          </FormLabel>
          <Select {...inputProps} id={`${id}-lang`} value={fm.lang} onChange={(e) => setFm((f) => ({ ...f, lang: e.target.value }))}>
            {langOptions.map((o) => (
              <option key={o.value || 'detect'} value={o.value}>
                {o.label}
              </option>
            ))}
          </Select>
          <FormHelperText fontSize="xs" color="page.fg-secondary">
            Sets the page language, its labels (日期 / Date) and its typesetting.
          </FormHelperText>
        </FormControl>
        <FormControl>
          <FormLabel fontSize="13px" htmlFor={`${id}-key`}>
            Translation key
          </FormLabel>
          <Input
            {...inputProps}
            id={`${id}-key`}
            value={fm.translationKey}
            onChange={(e) => setFm((f) => ({ ...f, translationKey: cleanTranslationKeyInput(e.target.value) }))}
            placeholder={ed.slug || 'e.g. edge-sorter'}
            fontFamily={MONO}
            fontSize="14px"
            autoComplete="off"
            spellCheck={false}
            aria-describedby={statusId}
          />
          <FormHelperText fontSize="xs" color="page.fg-secondary">
            a–z, 0–9, - and _ — the same on every version.
          </FormHelperText>
        </FormControl>
      </SimpleGrid>

      <Box id={statusId} mt={4} fontSize="13px">
        {!status.key ? (
          <Flex align="center" gap={3} wrap="wrap" color="page.fg-secondary">
            <Text m={0}>No key: this {noun} stands alone.</Text>
            {ed.slug ? (
              <Button size="xs" {...outlineButtonProps} onClick={() => setFm((f) => ({ ...f, translationKey: cleanTranslationKeyInput(ed.slug) }))}>
                Use “{ed.slug}”
              </Button>
            ) : null}
          </Flex>
        ) : items === null ? (
          <Text m={0} color="page.fg-secondary">
            Looking for other versions…
          </Text>
        ) : status.members.length === 0 ? (
          <Text m={0} color="page.fg-secondary">
            No other {noun} has this key yet. Give its translation the same key, or create one below.
          </Text>
        ) : (
          <>
            <Text m={0} mb={2} color="page.fg-secondary">
              Linked versions
            </Text>
            <Box as="ul" listStyleType="none" m={0} p={0} borderTop="1px solid" borderColor="page.border">
              {status.members.map((m) => (
                <Flex as="li" key={m.slug} align="center" gap={3} py={2} borderBottom="1px solid" borderColor="page.border" minW={0}>
                  <Box as="span" sx={chipSx} lang={translationLang(m.lang)}>
                    {languageAutonym(m.lang)}
                  </Box>
                  <Link
                    as={NextLink}
                    href={`/admin/${collection}/edit?slug=${encodeURIComponent(m.slug)}`}
                    color="page.fg"
                    className="link-underline"
                    flex={1}
                    minW={0}
                    noOfLines={1}
                    lang={translationLang(m.lang)}
                  >
                    {m.title}
                  </Link>
                  {m.draft ? (
                    <Box as="span" sx={chipSx}>
                      Draft
                    </Box>
                  ) : null}
                </Flex>
              ))}
            </Box>
            {status.ambiguous ? (
              <Text m={0} mt={2} {...warnTextProps}>
                {sameLanguage.length
                  ? `“${sameLanguage[0].title}” is in ${languageAutonym(lang)} too.`
                  : 'Two of the other versions share a language.'}{' '}
                Nothing in this group is linked until every version has its own language.
              </Text>
            ) : status.members.some((m) => m.draft) || fm.draft ? (
              <Text m={0} mt={2} color="page.fg-secondary">
                Drafts are linked once they are published.
              </Text>
            ) : null}
          </>
        )}
      </Box>

      {!ed.isNew && status.key && missing.length > 0 ? (
        <Flex mt={4} pt={4} borderTop="1px solid" borderColor="page.border" gap={3} align={{ base: 'stretch', sm: 'flex-end' }} direction={{ base: 'column', sm: 'row' }}>
          <FormControl maxW={{ sm: '220px' }}>
            <FormLabel fontSize="13px" htmlFor={`${id}-target`}>
              New version in
            </FormLabel>
            <Select {...inputProps} id={`${id}-target`} value={createLang} onChange={(e) => setTarget(e.target.value)}>
              {missing.map((l) => (
                <option key={l} value={l}>
                  {languageAutonym(l)}
                </option>
              ))}
            </Select>
          </FormControl>
          <Button {...outlineButtonProps} onClick={createDraft} isLoading={creating} loadingText="Creating" isDisabled={ed.dirty || !createLang}>
            Create draft
          </Button>
          <Text fontSize="xs" color="page.fg-secondary" m={0} flex={1} alignSelf="center">
            {ed.dirty
              ? 'Save first — the draft copies the saved version.'
              : `Copies this ${noun} into a new draft with the same key. Nothing is translated for you, and nothing is published.`}
          </Text>
        </Flex>
      ) : null}
    </Box>
  )
}
