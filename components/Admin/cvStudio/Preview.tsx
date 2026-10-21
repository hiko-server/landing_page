import { useCallback, useDeferredValue, useEffect, useMemo, useState } from 'react'
import { Box, Button, ButtonGroup, Flex, HStack, IconButton, Text, Tooltip, useColorModeValue } from '@chakra-ui/react'
import { ExternalLinkIcon } from '@chakra-ui/icons'
import { FaFilePdf } from 'react-icons/fa'
import CVResult from '../../CVViewerPage/CVResult'
import ScaledSheet from '../../CVViewerPage/ScaledSheet'
import { CV_SURFACES, publicSections, type CvLang, type CvSurface } from '../../../lib/cvVisibility'
import { SURFACE_LABEL } from './audience'
import { withEvidenceLinks, type CvWork } from '../../../lib/cvLinks'
import { cvPdfPath } from '../../../lib/cvExport/paths'
import type { OwnerNames } from '../../../lib/publications/names'
import { monoFont, useStudioTokens } from './fields'
import WebsitePreview from './WebsitePreview'
import type { Section } from './docOps'

const ZOOMS: Array<{ label: string; value: 'fit' | number }> = [
  { label: 'Fit', value: 'fit' },
  { label: '75%', value: 0.75 },
  { label: '100%', value: 1 },
]

type Mode = 'cv' | 'web'
const MODE_KEY = 'cv-studio:preview-mode'
const SURFACE_KEY = 'cv-studio:preview-surface'
/** The A4 sheet as each audience gets it (E4): /cv, the downloads, a private link. */
const SHEET_AS: Record<CvSurface, string> = { web: '/cv', download: 'PDF', private: 'Link' }

/**
 * Live preview of exactly what visitors get — same pruning, same renderers:
 *   A4 CV   → /cv, the PDF or a private link — the audience picked in the
 *             toolbar (publicSections 'cv' for that surface, E4) — through
 *             CVResult, with the evidence links resolved as /cv resolves
 *             them: a project's case study only when it is PUBLISHED — never
 *             a /work/<slug> that would 404)
 *   Website → the CV stack on /about (publicSections 'website')
 * Rendering is deferred so typing never waits on the preview.
 */
export default function Preview({
  sections,
  lang,
  onPages,
  ownerNames,
  works = null,
}: {
  sections: Section[]
  lang: CvLang
  /** Measured A4 page count of this language (readiness check). */
  onPages?: (lang: CvLang, pages: number) => void
  /** The owner's name forms (bold in publication author lists, as on /cv). */
  ownerNames?: OwnerNames
  /** Published case studies (lib/caseStudyLinks); null while unknown — then no case-study links. */
  works?: readonly CvWork[] | null
}) {
  const deferred = useDeferredValue(sections)
  const [mode, setMode] = useState<Mode>('cv')
  const [surface, setSurface] = useState<CvSurface>('web')
  const cvData = useMemo(
    () => (mode === 'cv' ? withEvidenceLinks(publicSections(deferred, 'cv', surface), { works: works ?? [] }) : []),
    [deferred, mode, works, surface],
  )
  const [zoom, setZoom] = useState<'fit' | number>('fit')
  const [scale, setScale] = useState(1)
  const { border, dim } = useStudioTokens()
  const canvas = useColorModeValue('gray.100', 'blackAlpha.600')
  const stale = deferred !== sections
  // The readiness page check is about the public CV: a private link's sheet is not reported.
  const reportPages = useCallback((n: number) => (surface === 'private' ? undefined : onPages?.(lang, n)), [onPages, lang, surface])

  useEffect(() => {
    try {
      if (localStorage.getItem(MODE_KEY) === 'web') setMode('web')
      const as = localStorage.getItem(SURFACE_KEY)
      if (as === 'download' || as === 'private') setSurface(as)
    } catch {
      /* storage unavailable — default to the A4 sheet as /cv shows it */
    }
  }, [])

  const pickSurface = (s: CvSurface) => {
    setSurface(s)
    try {
      localStorage.setItem(SURFACE_KEY, s)
    } catch {
      /* ignore */
    }
  }

  const pick = (m: Mode) => {
    setMode(m)
    try {
      localStorage.setItem(MODE_KEY, m)
    } catch {
      /* ignore */
    }
  }

  const segBtn = (active: boolean) => ({
    fontFamily: monoFont,
    fontSize: '10px',
    borderColor: active ? 'var(--accent)' : border,
    bg: active ? 'var(--accent-soft)' : undefined,
    // Accent words, not the brand accent itself (3.9–4.3:1 at 10px).
    color: active ? 'accent.text' : undefined,
    zIndex: active ? 1 : undefined,
  })

  return (
    <Flex direction="column" h="100%" minH={0}>
      <Flex
        align="center"
        justify="space-between"
        gap={2}
        px={3}
        py={1.5}
        minH="40px"
        borderBottom="1px solid"
        borderColor={border}
        flexShrink={0}
        wrap="wrap"
      >
        <HStack spacing={2}>
          <ButtonGroup size="xs" isAttached variant="outline" role="group" aria-label="Preview">
            <Button onClick={() => pick('cv')} aria-pressed={mode === 'cv'} {...segBtn(mode === 'cv')}>
              A4 CV
            </Button>
            <Button onClick={() => pick('web')} aria-pressed={mode === 'web'} {...segBtn(mode === 'web')}>
              Website
            </Button>
          </ButtonGroup>
          {mode === 'cv' ? (
            <ButtonGroup size="xs" isAttached variant="outline" role="group" aria-label="Show the A4 CV as">
              {CV_SURFACES.map((s) => (
                <Tooltip key={s} label={`As ${SURFACE_LABEL[s].toLowerCase()} show it`} hasArrow openDelay={300}>
                  <Button onClick={() => pickSurface(s)} aria-pressed={surface === s} {...segBtn(surface === s)}>
                    {SHEET_AS[s]}
                  </Button>
                </Tooltip>
              ))}
            </ButtonGroup>
          ) : null}
          <Text fontFamily={monoFont} fontSize="10px" color={dim} aria-live="polite">
            {mode === 'cv' ? `${Math.round(scale * 100)}%` : ''}
            {stale ? ' · updating' : ''}
          </Text>
        </HStack>
        <HStack spacing={1}>
          {mode === 'cv' ? (
            <ButtonGroup size="xs" isAttached variant="outline" role="group" aria-label="Zoom">
              {ZOOMS.map((z) => (
                <Button key={z.label} onClick={() => setZoom(z.value)} aria-pressed={zoom === z.value} {...segBtn(zoom === z.value)}>
                  {z.label}
                </Button>
              ))}
            </ButtonGroup>
          ) : null}
          <Tooltip label={mode === 'cv' ? 'Open /cv in a new tab (saved version)' : 'Open /about in a new tab (saved version)'} hasArrow>
            <IconButton
              as="a"
              href={mode === 'cv' ? `/cv?lang=${lang}` : '/about'}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={mode === 'cv' ? 'Open public CV page' : 'Open the about page'}
              icon={<ExternalLinkIcon />}
              size="xs"
              variant="ghost"
            />
          </Tooltip>
          {mode === 'cv' ? (
            <Tooltip label="Open the PDF (saved version)" hasArrow>
              <IconButton
                as="a"
                href={cvPdfPath(lang)}
                target="_blank"
                rel="noopener noreferrer"
                aria-label="Open the CV as PDF"
                icon={<FaFilePdf />}
                size="xs"
                variant="ghost"
              />
            </Tooltip>
          ) : null}
        </HStack>
      </Flex>
      {mode === 'cv' ? (
        <Box flex={1} minH={0} overflow="auto" p={{ base: 3, md: 5 }} bg={canvas}>
          <ScaledSheet zoom={zoom} pageGuides onScale={setScale} onPages={reportPages}>
            <CVResult cvData={cvData as any} lang={lang} ownerNames={ownerNames} />
          </ScaledSheet>
        </Box>
      ) : (
        <Box flex={1} minH={0} overflow="auto">
          <WebsitePreview sections={deferred} lang={lang} />
        </Box>
      )}
    </Flex>
  )
}
