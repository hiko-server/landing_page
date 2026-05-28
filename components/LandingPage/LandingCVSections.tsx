import React, { useState } from 'react'
import { Box, Flex, Text, useColorModeValue } from '@chakra-ui/react'
import EducationSection from '../PersonalInstruction/Education'
import ProjectSection from '../PersonalInstruction/Project'
import SkillSection from '../PersonalInstruction/Skill'
import CertificateSection from '../PersonalInstruction/Certificate'
import WorkExperience from '../PersonalInstruction/WorkExperience'
import CompetitionAwardsSection from '../PersonalInstruction/CompetitionAwards'

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

const LandingCVSections = ({ en, zh }: { en?: any[]; zh?: any[] }) => {
  const [language, setLanguage] = useState<Lang>('en')
  const cvData: any[] = language === 'zh' ? zh || [] : en || []

  const labelColor = useColorModeValue('gray.600', 'gray.500')
  const activeFg = useColorModeValue('gray.900', 'gray.50')
  const inactiveFg = useColorModeValue('gray.600', 'gray.500')
  const divider = useColorModeValue('rgba(0,0,0,0.10)', 'rgba(255,255,255,0.10)')

  const langs: Array<{ key: Lang; label: string }> = [
    { key: 'en', label: 'EN' },
    { key: 'zh', label: '中' },
  ]

  return (
    <Box w="100%" maxW="1100px" mx="auto">
      {/* Language toggle — mono pill row, replaces the native select */}
      <Flex align="center" gap={4} mb={[6, 8]}>
        <Text
          fontFamily={monoFont}
          fontSize="11px"
          letterSpacing="0.08em"
          color={labelColor}
          textTransform="uppercase"
        >
          Language
        </Text>
        <Box flex="1" h="1px" bg={divider} />
        <Flex gap={1} fontFamily={monoFont} fontSize="11px">
          {langs.map(({ key, label }) => (
            <Box
              key={key}
              as="button"
              onClick={() => setLanguage(key)}
              px={3}
              py={1}
              letterSpacing="0.08em"
              color={language === key ? activeFg : inactiveFg}
              borderBottom="1px solid"
              borderColor={language === key ? 'var(--accent)' : 'transparent'}
              sx={{
                transition: 'color 200ms, border-color 200ms',
                _hover: { color: activeFg },
              }}
              aria-pressed={language === key}
            >
              {label}
            </Box>
          ))}
        </Flex>
      </Flex>

      {cvData.map((section: any, key: number) => {
        const idx = key + 1
        const sessionName = section?.sessionName
        switch (sessionName) {
          case 'education':
            return <EducationSection key={key} index={idx} data={section} />
          case 'skill':
            return <SkillSection key={key} index={idx} data={section} />
          case 'certification':
            return <CertificateSection key={key} index={idx} data={section} />
          case 'workExperience':
            return <WorkExperience key={key} index={idx} data={section} />
          case 'competitionAwards':
            return (
              <CompetitionAwardsSection key={key} index={idx} data={section} />
            )
          case 'project':
            return <ProjectSection key={key} index={idx} data={section} />
          default:
            return null
        }
      })}
    </Box>
  )
}

export default LandingCVSections
