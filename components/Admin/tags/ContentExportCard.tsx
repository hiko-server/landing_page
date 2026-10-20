import { useState } from 'react'
import { Box, Button, Flex, Text, useToast } from '@chakra-ui/react'
import { MONO, Panel, outlineButtonProps } from '../shell/ui'
import { readJsonObject } from '../shell/http'

/**
 * "Export content" (H16): downloads /api/admin/export — every post, case
 * study and page as MDX with frontmatter, unpublished changes, the CV and
 * home documents, the redirects and the list of images, in one .zip. The
 * download goes through fetch so an expired session or a rate limit shows
 * a message instead of saving an error page as a file.
 */

const CONTENTS: Array<[string, string]> = [
  ['blog/ · work/', 'every post and case study, drafts included, as .mdx with YAML frontmatter'],
  ['unpublished-changes/', 'saved changes of live items that are not published yet'],
  ['pages/', '/now, /uses and the /about bio'],
  ['cv.json · home.json', 'the CV (EN + 中文, with visibility) and the home page'],
  ['redirects.json', 'old addresses of renamed items'],
  ['images.json', 'every image used, where, and uploads nothing uses'],
]

function filenameOf(res: Response): string {
  const m = /filename="([^"]+)"/.exec(res.headers.get('Content-Disposition') || '')
  return m ? m[1] : `content-${new Date().toISOString().slice(0, 10)}.zip`
}

export default function ContentExportCard() {
  const toast = useToast()
  const [busy, setBusy] = useState(false)

  const download = async () => {
    setBusy(true)
    try {
      const res = await fetch('/api/admin/export', { cache: 'no-store' })
      if (!res.ok) {
        const data = await readJsonObject(res)
        throw new Error(res.status === 401 ? 'Your session has expired — sign in again.' : data.error || `HTTP ${res.status}`)
      }
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = filenameOf(res)
      document.body.appendChild(a)
      a.click()
      a.remove()
      window.setTimeout(() => URL.revokeObjectURL(url), 1000)
      toast({ status: 'success', title: 'Export downloaded', description: `${a.download} · ${(blob.size / 1024).toFixed(0)} KB`, position: 'bottom-right' })
    } catch (e) {
      toast({ status: 'error', title: 'Export failed', description: e instanceof Error ? (e.message === 'Failed to fetch' ? 'Network error.' : e.message) : String(e), position: 'bottom-right' })
    } finally {
      setBusy(false)
    }
  }

  return (
    <Panel>
      <Flex gap={4} align={{ base: 'stretch', md: 'flex-start' }} justify="space-between" direction={{ base: 'column', md: 'row' }}>
        <Box minW={0}>
          <Text fontWeight={600} fontSize="sm">
            Everything you wrote, in one .zip
          </Text>
          <Box as="dl" mt={2} fontSize="13px" sx={{ display: 'grid', gridTemplateColumns: { base: '1fr', sm: 'auto 1fr' }, columnGap: 4, rowGap: 1 }}>
            {CONTENTS.map(([k, v]) => (
              <Box key={k} display="contents">
                <Text as="dt" fontFamily={MONO} fontSize="12px" color="page.fg">
                  {k}
                </Text>
                <Text as="dd" m={0} color="page.fg-secondary" mb={{ base: 1.5, sm: 0 }}>
                  {v}
                </Text>
              </Box>
            ))}
          </Box>
          <Text fontSize="xs" color="page.fg-secondary" mt={3}>
            Image files are not inside — the full-site snapshots under Storage &amp; backups include them.
          </Text>
        </Box>
        <Button size="sm" {...outlineButtonProps} onClick={() => void download()} isLoading={busy} loadingText="Preparing" flexShrink={0} data-testid="content-export">
          Download .zip
        </Button>
      </Flex>
    </Panel>
  )
}
