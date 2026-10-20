import { useId, useMemo, useState } from 'react'
import dynamic from 'next/dynamic'
import { Box, Button, Flex, Text } from '@chakra-ui/react'
import { OrcidIdIcon } from '../../Icons/orcid'
import { PAPERS_KEY, type PublicationEntry } from '../../../lib/publications/types'
import { existingPapers } from '../../../lib/orcid/works'
import { orcidRecordUrl } from '../../../lib/orcid/uri'
import { outlineButtonProps } from '../shell/ui'
import { useStudio } from './StudioContext'
import { useStudioTokens } from './fields'

// The dialog (and the works mapping it runs) loads on the first open.
const OrcidImportDialog = dynamic(() => import('./OrcidImportDialog'), { ssr: false })

/**
 * The Publications section's "Import from ORCID" row in CV Studio: with an
 * iD in Personal Info (either language; hidden or not — hiding keeps it off
 * the public CV, not out of the import) it opens the import dialog; without
 * one it says where the iD goes and jumps there. The ticked works are added
 * to the unsaved document as ONE undo step, like papers typed by hand
 * (mirrored into the other language when the lists are linked and line up).
 */
export default function OrcidImport({ section, sectionIdx }: { section: any; sectionIdx: number }) {
  const api = useStudio()
  const { border, dim } = useStudioTokens()
  const hintId = useId()
  const [open, setOpen] = useState(false)
  // Mounted from the first open on, so closing animates and hands focus back to the button.
  const [mounted, setMounted] = useState(false)
  const papers: unknown[] = useMemo(() => (Array.isArray(section?.[PAPERS_KEY]) ? section[PAPERS_KEY] : []), [section])
  const existing = useMemo(() => existingPapers(papers), [papers])
  const listPath = [sectionIdx, PAPERS_KEY]
  const twin = api.linked ? api.twinLength(listPath) : null
  const both = twin !== null && twin === papers.length
  const here = api.lang === 'en' ? 'EN' : '中文'
  const langLabel = both ? 'EN and 中文' : here
  const hasId = !!api.orcid

  const onImport = (entries: PublicationEntry[]) => {
    api.appendEntries(listPath, entries, `Added ${entries.length} paper${entries.length === 1 ? '' : 's'} from ORCID`)
  }

  return (
    <Box border="1px solid" borderColor={border} borderRadius="md" px={{ base: 3, md: 4 }} py={3} data-testid="orcid-import">
      <Flex align={{ base: 'flex-start', sm: 'center' }} gap={3} direction={{ base: 'column', sm: 'row' }}>
        <Flex gap={2.5} align="flex-start" flex="1" minW={0}>
          <OrcidIdIcon size={20} style={{ flexShrink: 0, marginTop: 1 }} />
          <Box minW={0}>
            <Text fontSize="13px" fontWeight={600} lineHeight="1.4">
              Import from ORCID
            </Text>
            <Text id={hintId} fontSize="12px" color={dim} lineHeight="1.5" mt={0.5} sx={{ overflowWrap: 'anywhere' }}>
              {hasId
                ? `Lists the public works of ${orcidRecordUrl(api.orcid)}; the ones you tick become papers here to review. Nothing is saved until you save the CV.`
                : 'Add your ORCID iD in Personal Info to list the public works of your ORCID record and add them here.'}
            </Text>
          </Box>
        </Flex>
        <Flex gap={2} flexShrink={0} wrap="wrap">
          {hasId ? null : (
            <Button size="sm" variant="ghost" color="accent.text" fontWeight={500} onClick={() => api.goToField('personalInformation', 'orcid')}>
              Add ORCID iD
            </Button>
          )}
          <Button
            size="sm"
            {...outlineButtonProps}
            isDisabled={!hasId}
            aria-describedby={hintId}
            onClick={() => {
              setMounted(true)
              setOpen(true)
            }}
          >
            Import from ORCID…
          </Button>
        </Flex>
      </Flex>
      {mounted ? (
        <OrcidImportDialog isOpen={open} onClose={() => setOpen(false)} orcid={api.orcid} existing={existing} langLabel={langLabel} onImport={onImport} />
      ) : null}
    </Box>
  )
}
