import React, { useState } from 'react'
import { Box, Flex, Text } from '@chakra-ui/react'
import EducationSection from '../PersonalInstruction/Education'
import ProjectSection from '../PersonalInstruction/Project'
import SkillSection from '../PersonalInstruction/Skill'
import CertificateSection from '../PersonalInstruction/Certificate'
import WorkExperience from '../PersonalInstruction/WorkExperience'
import CompetitionAwardsSection from '../PersonalInstruction/CompetitionAwards'
import PatentsSection from '../PersonalInstruction/Patents'
import ExtraSkillSection from '../PersonalInstruction/ExtraSkill'
import { isSectionOnWebsite } from '../../lib/cvVisibility'
import type { WorkIndexItem } from './projectMatch'

/**
 * Renders the CV accordion stack on /about and /cv.
 *
 * Owns:
 *   - language picker (en / zh) at the top, restyled as a mono toggle
 *     instead of the default OS <select>
 *   - assigns each section a 1-indexed number that gets shown in the
 *     `[NN]` mono index inside CVSectionShell
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

type LandingCVSectionsProps = {
  en?: any[]
  zh?: any[]
  /** /work case-study index; CV projects that match one link to it ("Case study →"). */
  work?: readonly WorkIndexItem[]
}

const LandingCVSections = ({ en, zh, work }: LandingCVSectionsProps) => {
  const [language, setLanguage] = useState<Lang>('en')
  // Fall back to EN when there is no Chinese CV at all, and hide the toggle.
  const hasZh = Array.isArray(zh) && zh.some((s: any) => RENDERED.includes(s?.sessionName))
  const active: Lang = hasZh ? language : 'en'
  const cvData: any[] = active === 'zh' ? zh || [] : en || []

  const langs: Array<{ key: Lang; label: string }> = [
    { key: 'en', label: 'EN' },
    { key: 'zh', label: '中' },
  ]

  return (
    <Box w="100%" maxW="1100px" mx="auto">
      {/* Language toggle — mono pill row, replaces the native select */}
      <Flex align="center" gap={4} mb={[6, 8]}>
        <Text fontFamily={monoFont} fontSize="11px" letterSpacing="0.08em" color="page.fg-secondary" textTransform="uppercase">
          {hasZh ? 'Language' : 'CV'}
        </Text>
        <Box flex="1" h="1px" bg="page.border" />
        {hasZh && (
          <Flex gap={1} fontFamily={monoFont} fontSize="11px" role="group" aria-label="CV language">
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
        personalInformation is rendered by the hero, not here. Filter first so
        the `[NN]` index chips count from 1 with no gaps, whatever order the
        sections sit in. Data is already website-pruned server-side; the
        showOnWebsite check is a second guard for unpruned callers.
      */}
      <Flex direction="column" lang={active === 'zh' ? 'zh-Hans' : undefined}>
        {cvData
          .filter((s: any) => RENDERED.includes(s?.sessionName) && isSectionOnWebsite(s))
          .map((section: any, key: number) => {
            const idx = key + 1
            const k = `${section.sessionName}-${key}`
            const props = { index: idx, data: section, lang: active }
            switch (section.sessionName) {
              case 'education':
                return <EducationSection key={k} {...props} />
              case 'skill':
                return <SkillSection key={k} {...props} />
              case 'certification':
                return <CertificateSection key={k} {...props} />
              case 'workExperience':
                return <WorkExperience key={k} {...props} />
              case 'competitionAwards':
                return <CompetitionAwardsSection key={k} {...props} />
              case 'project':
                return <ProjectSection key={k} {...props} work={work} />
              case 'patents':
                return <PatentsSection key={k} {...props} />
              case 'extraSkill':
                return <ExtraSkillSection key={k} {...props} />
              default:
                return null
            }
          })}
      </Flex>
    </Box>
  )
}

export default LandingCVSections
