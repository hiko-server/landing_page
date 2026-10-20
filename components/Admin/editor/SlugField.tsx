import { useState } from 'react'
import dynamic from 'next/dynamic'
import { Button, Flex, FormControl, FormHelperText, FormLabel, Input, Text } from '@chakra-ui/react'
import { inputProps, MONO, outlineButtonProps, warnTextProps } from '../shell/ui'
import type { useMdxItemEditor } from '../shell/useMdxItemEditor'

// The dialog (and its dry-run requests) loads when the owner opens it.
const SlugRenameDialog = dynamic(() => import('./SlugRenameDialog'), { ssr: false })

type ItemFm = Record<string, unknown> & { draft: boolean }
type Ed<F extends ItemFm> = ReturnType<typeof useMdxItemEditor<F>>

/**
 * The slug field of the post and case-study editors. New items type it (it
 * follows the title until edited); existing items show it read-only with
 * "Change…", which opens the rename dialog (H6): the old address keeps
 * working through a permanent redirect and internal links are rewritten.
 * Old addresses that redirect here are listed under the field.
 */
export default function SlugField<F extends ItemFm>({ ed, collection, placeholder }: { ed: Ed<F>; collection: 'blog' | 'work'; placeholder: string }) {
  const [renameOpen, setRenameOpen] = useState(false)
  const published = ed.mode === 'published'
  const helpId = 'item-slug-help'

  return (
    <FormControl isRequired={ed.isNew}>
      <FormLabel fontSize="13px" htmlFor="item-slug">
        Slug
      </FormLabel>
      <Flex gap={2}>
        <Input
          {...inputProps}
          id="item-slug"
          value={ed.slug}
          placeholder={placeholder}
          onChange={(e) => ed.setSlug(e.target.value.trim().toLowerCase())}
          isReadOnly={!ed.isNew}
          fontFamily={MONO}
          fontSize="14px"
          autoComplete="off"
          spellCheck={false}
          aria-describedby={helpId}
          color={ed.isNew ? undefined : 'page.fg-secondary'}
        />
        {!ed.isNew && ed.loadState === 'ready' ? (
          <Button size="md" {...outlineButtonProps} flexShrink={0} onClick={() => setRenameOpen(true)} aria-haspopup="dialog">
            Change…
          </Button>
        ) : null}
      </Flex>
      <FormHelperText id={helpId} fontSize="xs" {...(ed.slugHint ? warnTextProps : { color: 'page.fg-secondary' })}>
        {ed.slugHint
          ? `${ed.slugHint} — the title has no English words to build one from.`
          : ed.isNew
            ? `Follows the title until you edit it. a–z, 0–9, - and _; becomes /${collection}/<slug>.`
            : `${published ? 'Published' : 'Will publish'} at /${collection}/${ed.slug}. Changing it keeps the old address working.`}
      </FormHelperText>
      {!ed.isNew && ed.redirectsFrom.length ? (
        <Text fontSize="xs" color="page.fg-secondary" mt={1}>
          Also reached from{' '}
          {ed.redirectsFrom.map((from, i) => (
            <span key={from}>
              {i ? ', ' : ''}
              <Text as="span" fontFamily={MONO}>
                /{collection}/{from}
              </Text>
            </span>
          ))}{' '}
          (redirect{ed.redirectsFrom.length === 1 ? '' : 's'}).
        </Text>
      ) : null}
      {renameOpen ? (
        <SlugRenameDialog
          isOpen={renameOpen}
          onClose={() => setRenameOpen(false)}
          collection={collection}
          currentSlug={ed.slugParam}
          title={String(ed.fm.title || '')}
          published={published}
          dirty={ed.dirty}
          redirectsFrom={ed.redirectsFrom}
          planRename={ed.planRename}
          renameTo={ed.renameTo}
          removeRedirect={ed.removeRedirect}
        />
      ) : null}
    </FormControl>
  )
}
