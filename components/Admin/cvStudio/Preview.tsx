import React, { useDeferredValue, useEffect, useMemo, useState } from 'react'
import { Box, Button, ButtonGroup, Flex, HStack, IconButton, Text, Tooltip, useColorModeValue } from '@chakra-ui/react'
import { ExternalLinkIcon } from '@chakra-ui/icons'
import { FaPrint } from 'react-icons/fa'
import CVResult from '../../CVViewerPage/CVResult'
import ScaledSheet from '../../CVViewerPage/ScaledSheet'
import { publicSections, type CvLang } from '../../../lib/cvVisibility'
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

/**
 * Live preview of exactly what visitors get — same pruning, same renderers:
 *   A4 CV   → /cv and the PDF (publicSections 'cv' through CVResult)
 *   Website → the CV stack on /about (publicSections 'website')
 * Rendering is deferred so typing never waits on the preview.
 */
export default function Preview({ sections, lang }: { sections: Section[]; lang: CvLang }) {
  const deferred = useDeferredValue(sections)
  const [mode, setMode] = useState<Mode>('cv')
  const cvData = useMemo(() => (mode === 'cv' ? publicSections(deferred, 'cv') : []), [deferred, mode])
  const [zoom, setZoom] = useState<'fit' | number>('fit')
  const [scale, setScale] = useState(1)
  const { border, dim } = useStudioTokens()
  const canvas = useColorModeValue('gray.100', 'blackAlpha.600')
  const stale = deferred !== sections

  useEffect(() => {
    try {
      if (localStorage.getItem(MODE_KEY) === 'web') setMode('web')
    } catch {
      /* storage unavailable — default to the A4 sheet */
    }
  }, [])

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
    color: active ? 'var(--accent)' : undefined,
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
            <Tooltip label="Print / Save as PDF (saved version)" hasArrow>
              <IconButton
                as="a"
                href={`/cv?lang=${lang}&print=1`}
                target="_blank"
                rel="noopener noreferrer"
                aria-label="Print or save the CV as PDF"
                icon={<FaPrint />}
                size="xs"
                variant="ghost"
              />
            </Tooltip>
          ) : null}
        </HStack>
      </Flex>
      {mode === 'cv' ? (
        <Box flex={1} minH={0} overflow="auto" p={{ base: 3, md: 5 }} bg={canvas}>
          <ScaledSheet zoom={zoom} pageGuides onScale={setScale}>
            <CVResult cvData={cvData as any} lang={lang} />
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
