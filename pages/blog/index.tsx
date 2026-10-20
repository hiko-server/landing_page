import { useMemo } from 'react'
import type { GetStaticProps } from 'next'
import { Box, Flex, Text, Link } from '@chakra-ui/react'
import NextLink from 'next/link'
import HeaderFooter from '../../layout/HeaderFooter'
import CustomHead from '../../components/General-UI/CustomHead'
import PageHeader from '../../components/General-UI/PageHeader'
import EmptyState from '../../components/General-UI/EmptyState'
import TagFilterBar, { TagPrepaint, useTagFilter } from '../../components/Article/TagFilter'
import { hasTag, tagCounts, tagSlugList } from '../../lib/tagFilter'
import { formatPostDate, isoDate } from '../../lib/postDate'
import { absUrl, personAuthor, PERSON_NAME, SITE_HOST } from '../../lib/schema'
import { ogPresetUrl } from '../../lib/og/presets'
import { fillUi } from '../../lib/uiStrings'
import type { BlogIndexProps } from '../../lib/indexPages'

export type Props = BlogIndexProps

const MONO = 'var(--font-geist-mono), monospace'

/**
 * /blog — every published post, newest first, with a shareable tag filter
 * (`?tag=edge-ai`, components/Article/TagFilter.tsx). A post published in
 * several languages is listed once, in English where it exists, marked
 * "Also in 简体中文" (its page switches language). ISR (60 s).
 *
 * /zh/blog (pages/zh/blog.tsx, F3) renders this page with the posts in
 * Chinese and Chinese words; it exists only while a Chinese post is
 * published (lib/indexPages). The words arrive with the props in the page's
 * language (lib/uiStrings/lists), so no page bundles the other languages.
 */
export default function BlogIndex({ posts, ui, lang, alternates, nameZh }: Props) {
  const t = ui.t
  const zh = lang !== 'en'
  const path = zh ? '/zh/blog' : '/blog'
  // Tags with counts, alphabetical, so the chip row never reshuffles.
  const tags = useMemo(() => tagCounts(posts.map((p) => p.frontmatter.tags)), [posts])
  const { active, select } = useTagFilter(tags)

  const visible = useMemo(() => (active ? posts.filter((p) => hasTag(p.frontmatter.tags, active)) : posts), [posts, active])
  const owner = zh && nameZh ? `${nameZh}（Lucian）` : PERSON_NAME
  // A title or description in another language than the page's says so.
  const ownLang = (l: string) => (l === lang ? undefined : l)

  return (
    <>
      <CustomHead
        title={t.blog.title}
        description={fillUi(t.blog.description, { name: owner })}
        url={absUrl(path)}
        image={ogPresetUrl('writing')}
        lang={lang}
        nameZh={nameZh}
        alternates={alternates}
        jsonLd={{
          '@context': 'https://schema.org',
          '@type': 'Blog',
          name: `${SITE_HOST.toUpperCase()} — ${t.blog.listName}`,
          url: absUrl(path),
          inLanguage: lang,
          author: personAuthor,
          blogPost: posts.slice(0, 10).map((p) => ({
            '@type': 'BlogPosting',
            headline: p.frontmatter.title,
            url: absUrl(p.permalink),
            datePublished: isoDate(p.frontmatter.date) || undefined,
            inLanguage: p.lang,
          })),
        }}
      />
      <HeaderFooter>
        <Box maxW="var(--container-content)" mx="auto" px={[4, 6, 8]} py={[12, 16]}>
          <PageHeader eyebrow={t.blog.eyebrow} title={t.blog.heading} lede={t.blog.lede} />

          {tags.length > 0 && (
            <TagFilterBar
              tags={tags}
              total={posts.length}
              active={active}
              onSelect={select}
              label={t.blog.filterLabel}
              noun={{ one: t.blog.nounOne, many: t.blog.nounMany }}
              allLabel={t.allTags}
              announcement={t.taggedAnnouncement}
              matching={visible.length}
            />
          )}

          {visible.length === 0 ? (
            <EmptyState
              title={t.blog.emptyTitle}
              actions={[
                { label: t.nav.work, href: zh ? '/zh/work' : '/work' },
                { label: t.nav.cv, href: zh ? '/cv/zh' : '/cv' },
              ]}
              actionsLabel={t.whereNext}
            >
              {t.blog.emptyBody}
            </EmptyState>
          ) : (
            <>
              <TagPrepaint tags={tags} />
              <Box as="ul" className="hover-list" listStyleType="none" m={0} p={0} borderTop="1px solid" borderColor="page.border">
                {visible.map((p) => (
                  <Box
                    as="li"
                    key={p.slug}
                    className="hover-item pressable"
                    borderBottom="1px solid"
                    borderColor="page.border"
                    data-tag-item=""
                    data-tag-slugs={tagSlugList(p.frontmatter.tags)}
                    data-vt-morph={p.permalink}
                    data-kbd-item=""
                  >
                    <Link
                      as={NextLink}
                      href={p.permalink}
                      data-group=""
                      _hover={{ textDecoration: 'none' }}
                      _focusVisible={{ outline: '2px solid var(--accent)', outlineOffset: '2px' }}
                      display="block"
                      py={5}
                    >
                      <Flex direction={['column', 'row']} align={['flex-start', 'baseline']} gap={[1, 6]}>
                        <Text
                          as="time"
                          className="tnum"
                          dateTime={isoDate(p.frontmatter.date) || undefined}
                          flexShrink={0}
                          fontFamily={MONO}
                          fontSize="12px"
                          color="page.fg-secondary"
                          w={['auto', '110px']}
                        >
                          {formatPostDate(p.frontmatter.date, lang)}
                        </Text>
                        <Box flex={1} minW={0}>
                          <Text
                            as="span"
                            display="block"
                            color="page.fg"
                            fontWeight={500}
                            fontSize="17px"
                            transition="color 150ms var(--ease-out-quart)"
                            _groupHover={{ color: 'accent.text' }}
                            lang={ownLang(p.lang)}
                            data-vt-part="title"
                          >
                            {p.frontmatter.title}
                          </Text>
                          {p.frontmatter.description && (
                            <Text
                              as="span"
                              display="block"
                              color="page.fg-secondary"
                              fontSize="14px"
                              mt={1}
                              noOfLines={2}
                              lang={ownLang(p.lang)}
                            >
                              {p.frontmatter.description}
                            </Text>
                          )}
                          {p.alsoIn.length > 0 && (
                            <Text as="span" display="block" mt={1.5} fontFamily={MONO} fontSize="11px" color="page.fg-secondary" data-also-in="">
                              {t.alsoIn}{' '}
                              {p.alsoIn.map((l, i) => (
                                <span key={l.lang}>
                                  {i > 0 ? ', ' : ''}
                                  <span lang={l.lang}>{l.name}</span>
                                </span>
                              ))}
                            </Text>
                          )}
                        </Box>
                        <Text as="span" flexShrink={0} fontFamily={MONO} fontSize="11px" color="page.fg-secondary" className="tnum">
                          {fillUi(t.blog.minutesRead, { n: p.readingMinutes })}
                          <Box as="span" aria-hidden className="nudge" ml={2} color="page.fg-subtle">
                            →
                          </Box>
                        </Text>
                      </Flex>
                    </Link>
                  </Box>
                ))}
              </Box>
            </>
          )}
        </Box>
      </HeaderFooter>
    </>
  )
}

export const getStaticProps: GetStaticProps<Props> = async () => (await import('../../lib/indexPages')).loadBlogIndex('en')
