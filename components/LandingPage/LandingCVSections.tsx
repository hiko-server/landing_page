import { Fragment, useMemo, useState, type ReactNode } from 'react'
import { Box, Flex, Text } from '@chakra-ui/react'
import EducationSection from '../PersonalInstruction/Education'
import ProjectSection from '../PersonalInstruction/Project'
import SkillSection from '../PersonalInstruction/Skill'
import CertificateSection from '../PersonalInstruction/Certificate'
import WorkExperience from '../PersonalInstruction/WorkExperience'
import CompetitionAwardsSection from '../PersonalInstruction/CompetitionAwards'
import PatentsSection from '../PersonalInstruction/Patents'
import ExtraSkillSection from '../PersonalInstruction/ExtraSkill'
import { CVSectionsContext } from '../PersonalInstruction/_CVSectionShell'
import { isSectionOnWebsite } from '../../lib/cvVisibilityRead'
import type { WorkIndexItem } from './projectMatch'

/**
 * Renders the CV accordion stack on /about and /cv.
 *
 * Owns:
 *   - language picker (en / zh) at the top, restyled as a mono toggle
 *     instead of the default OS <select>, on the row of the page's heading
 *     (`title`)
 */

const monoFont = 'var(--font-geist-mono), ui-monospace, monospace'

type Lang = 'en' | 'zh'

/**
 * CV sections this accordion renders (personalInformation is the hero's).
 * Pages pass exactly this list to readPublicCvSections so nothing else is
 * shipped in their props.
 */
export const CV_WEBSITE_SECTIONS = [
  'education',
  'workExperience',
  'project',
  'patents',
  'competitionAwards',
  'skill',
  'extraSkill',
  'certification',
] as const

const RENDERED: readonly string[] = CV_WEBSITE_SECTIONS

/** The sections a language renders, in order (what the accordion and a section nav list). */
export function renderedCvSections(list: readonly any[] | undefined): any[] {
  return (Array.isArray(list) ? list : []).filter((s: any) => RENDERED.includes(s?.sessionName) && isSectionOnWebsite(s))
}

/** True when the Chinese CV has at least one section this stack renders (the EN / 中 toggle shows). */
export function hasChineseCv(zh: readonly any[] | undefined): boolean {
  return renderedCvSections(zh).length > 0
}

type LandingCVSectionsProps = {
  en?: any[]
  zh?: any[]
  /** /work case-study index; CV projects that match one link to it ("Case study →"). */
  work?: readonly WorkIndexItem[]
  /** Every section starts open. */
  expanded?: boolean
  /** Wrap each section's toggle in a heading of this level (page outline). */
  headingLevel?: 'h2' | 'h3'
  /** Give each section an anchor id `${idPrefix}${sessionName}` (e.g. "about-education"). */
  idPrefix?: string
  /** Controlled language (with onLanguageChange); uncontrolled when omitted. */
  language?: Lang
  onLanguageChange?: (lang: Lang) => void
  /** Replaces the mono "Language / CV" caption on the left of the toggle row. */
  title?: ReactNode
  /** The page's words for the toggle row (lib/uiStrings/about cvToggle; English by default). */
  labels?: { language: string; cv: string; group: string }
  /** The page's language: the stack in the other language is marked with its own lang (F3). */
  pageLang?: 'en' | 'zh'
}

const TOGGLE_EN = { language: 'Language', cv: 'CV', group: 'CV language' }

const LandingCVSections = ({ en, zh, work, expanded, headingLevel, idPrefix, language: controlled, onLanguageChange, title, labels = TOGGLE_EN, pageLang = 'en' }: LandingCVSectionsProps) => {
  const [own, setOwn] = useState<Lang>(pageLang)
  const language = controlled ?? own
  const setLanguage = (lang: Lang) => {
    if (controlled === undefined) setOwn(lang)
    onLanguageChange?.(lang)
  }
  // Fall back to EN when there is no Chinese CV at all, and hide the toggle.
  const hasZh = hasChineseCv(zh)
  const active: Lang = hasZh ? language : 'en'
  const cvData: any[] = active === 'zh' ? zh || [] : en || []
  const context = useMemo(() => ({ expanded, headingLevel }), [expanded, headingLevel])

  const langs: Array<{ key: Lang; label: string }> = [
    { key: 'en', label: 'EN' },
    { key: 'zh', label: '中' },
  ]

  return (
    <Box w="100%" maxW="1100px" mx="auto">
      {/* The heading row: the page's title, then the language toggle (mono pills, replaces the native select) at the far end. */}
      <Flex align="center" justify="space-between" gap={4} minH="32px" mb={{ base: 5, md: 6 }}>
        {title ?? (
          <Text fontFamily={monoFont} fontSize="11px" letterSpacing="0.08em" color="page.fg-secondary" textTransform="uppercase">
            {hasZh ? labels.language : labels.cv}
          </Text>
        )}
        {hasZh && (
          <Flex gap={1} fontFamily={monoFont} fontSize="11px" role="group" aria-label={labels.group}>
            {langs.map(({ key, label }) => (
              <Box
                key={key}
                as="button"
                type="button"
                onClick={() => setLanguage(key)}
                px={3}
                py={1.5}
                minH="32px"
                letterSpacing="0.08em"
                color={active === key ? 'page.fg' : 'page.fg-secondary'}
                borderBottom="1px solid"
                borderColor={active === key ? 'var(--accent)' : 'transparent'}
                sx={{
                  transition: 'color 200ms, border-color 200ms',
                  _hover: { color: 'page.fg' },
                }}
                _focusVisible={{ outline: '2px solid var(--accent)', outlineOffset: '2px' }}
                aria-pressed={active === key}
                aria-label={key === 'en' ? 'English' : '中文'}
                lang={key === 'en' ? 'en' : 'zh-Hans'}
              >
                {label}
              </Box>
            ))}
          </Flex>
        )}
      </Flex>

      {/*
        personalInformation is rendered by the hero, not here. Data is already
        website-pruned server-side; the showOnWebsite check is a second guard
        for unpruned callers.
      */}
      <CVSectionsContext.Provider value={context}>
        <Flex direction="column" lang={active === pageLang ? undefined : active === 'zh' ? 'zh-Hans' : 'en'}>
          {renderedCvSections(cvData).map((section: any, key: number) => {
            const k = `${section.sessionName}-${key}`
            const props = { data: section, lang: active }
            let body: ReactNode = null
            switch (section.sessionName) {
              case 'education':
                body = <EducationSection {...props} />
                break
              case 'skill':
                body = <SkillSection {...props} />
                break
              case 'certification':
                body = <CertificateSection {...props} />
                break
              case 'workExperience':
                body = <WorkExperience {...props} />
                break
              case 'competitionAwards':
                body = <CompetitionAwardsSection {...props} />
                break
              case 'project':
                body = <ProjectSection {...props} work={work} />
                break
              case 'patents':
                body = <PatentsSection {...props} />
                break
              case 'extraSkill':
                body = <ExtraSkillSection {...props} />
                break
              default:
                body = null
            }
            if (!body) return null
            // The anchor goes on the section's own root (CVSectionShell), so a
            // section that renders nothing leaves no empty target behind.
            return idPrefix ? (
              <CVSectionsContext.Provider key={k} value={{ ...context, anchorId: `${idPrefix}${section.sessionName}` }}>
                {body}
              </CVSectionsContext.Provider>
            ) : (
              <Fragment key={k}>{body}</Fragment>
            )
          })}
        </Flex>
      </CVSectionsContext.Provider>
    </Box>
  )
}

export default LandingCVSections
