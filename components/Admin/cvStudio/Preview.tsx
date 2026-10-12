import React, { useDeferredValue, useMemo, useState } from 'react'
import { Box, Button, ButtonGroup, Flex, HStack, IconButton, Text, Tooltip, useColorModeValue } from '@chakra-ui/react'
import { ExternalLinkIcon } from '@chakra-ui/icons'
import { FaPrint } from 'react-icons/fa'
import CVResult from '../../CVViewerPage/CVResult'
import ScaledSheet from '../../CVViewerPage/ScaledSheet'
import { publicSections, type CvLang } from '../../../lib/cvVisibility'
import { monoFont, useStudioTokens } from './fields'
import type { Section } from './docOps'

const ZOOMS: Array<{ label: string; value: 'fit' | number }> = [
  { label: 'Fit', value: 'fit' },
  { label: '75%', value: 0.75 },
  { label: '100%', value: 1 },
]

/**
 * Live A4 preview — exactly what /cv and the PDF will show (same pruning,
 * same renderer). Rendering is deferred so typing never waits on the sheet.
 */
export default function Preview({ sections, lang }: { sections: Section[]; lang: CvLang }) {
  const deferred = useDeferredValue(sections)
  const publicData = useMemo(() => publicSections(deferred, 'cv'), [deferred])
  const [zoom, setZoom] = useState<'fit' | number>('fit')
  const [scale, setScale] = useState(1)
  const { border, dim } = useStudioTokens()
  const canvas = useColorModeValue('gray.100', 'blackAlpha.600')
  const stale = deferred !== sections

  return (
    <Flex direction="column" h="100%" minH={0}>
      <Flex align="center" justify="space-between" gap={2} px={3} h="40px" borderBottom="1px solid" borderColor={border} flexShrink={0}>
        <HStack spacing={2}>
          <Text fontFamily={monoFont} fontSize="10px" letterSpacing="0.12em" textTransform="uppercase" color={dim}>
            Preview
          </Text>
          <Text fontFamily={monoFont} fontSize="10px" color={dim} opacity={0.7}>
            {Math.round(scale * 100)}%{stale ? ' · …' : ''}
          </Text>
        </HStack>
        <HStack spacing={1}>
          <ButtonGroup size="xs" isAttached variant="outline">
            {ZOOMS.map((z) => (
              <Button
                key={z.label}
                onClick={() => setZoom(z.value)}
                aria-pressed={zoom === z.value}
                fontFamily={monoFont}
                fontSize="10px"
                borderColor={border}
                bg={zoom === z.value ? 'var(--accent-soft)' : undefined}
                color={zoom === z.value ? 'var(--accent)' : undefined}
              >
                {z.label}
              </Button>
            ))}
          </ButtonGroup>
          <Tooltip label="Open /cv in a new tab" hasArrow>
            <IconButton
              as="a"
              href={`/cv?lang=${lang}`}
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Open public CV page"
              icon={<ExternalLinkIcon />}
              size="xs"
              variant="ghost"
            />
          </Tooltip>
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
        </HStack>
      </Flex>
      <Box
        flex={1}
        minH={0}
        overflow="auto"
        p={{ base: 3, md: 5 }}
        bg={canvas}
      >
        <ScaledSheet zoom={zoom} pageGuides onScale={setScale}>
          <CVResult cvData={publicData as any} lang={lang} />
        </ScaledSheet>
      </Box>
    </Flex>
  )
}
