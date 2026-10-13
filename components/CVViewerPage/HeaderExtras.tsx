import { createContext, useContext } from 'react'
import { Box, Text } from '@chakra-ui/react'
import type { CvLang } from '../../lib/cvVisibility'
import type { CvHeaderExtras } from '../../lib/cvLocale'
import { extrasLines, type ExtrasLine } from './headerExtrasLines'

/**
 * The CV header lines that come from the owner's availability
 * (lib/cvLocale cvHeaderExtras): the right-to-work line, and on the Chinese
 * CV the job intent (求职意向). The /cv pages provide them through this
 * context; without a provider (e.g. the Studio preview) nothing renders.
 */
export const CvHeaderExtrasContext = createContext<CvHeaderExtras | null>(null)

export type { ExtrasLine }

/** The current page's header lines for `lang`. */
export function useCvHeaderLines(lang: CvLang): ExtrasLine[] {
  return extrasLines(useContext(CvHeaderExtrasContext), lang)
}

/** A4 sheet: compact labelled lines under the name block (optionally carrying the accent rule). */
export function SheetHeaderExtras({ lines, lang, rule }: { lines: ExtrasLine[]; lang: CvLang; rule?: boolean }) {
  if (!lines.length) return null
  const sep = lang === 'zh' ? '：' : ': '
  return (
    <Box
      px="10px"
      pb={rule ? '10px' : '6px'}
      mt="-6px"
      fontSize="12px"
      lineHeight="1.55"
      borderBottom={rule ? '3px solid var(--cv-separator-color, blue)' : undefined}
      data-cv-extras=""
    >
      {lines.map((l) => (
        <Text key={l.key} data-cv-extra={l.key}>
          <Text as="span" fontWeight={700}>
            {l.label}
          </Text>
          {sep}
          {l.value}
        </Text>
      ))}
    </Box>
  )
}
