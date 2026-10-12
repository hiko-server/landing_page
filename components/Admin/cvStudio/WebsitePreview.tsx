import React, { useMemo } from 'react'
import { Box, Flex, Text } from '@chakra-ui/react'
import EducationSection from '../../PersonalInstruction/Education'
import ProjectSection from '../../PersonalInstruction/Project'
import SkillSection from '../../PersonalInstruction/Skill'
import CertificateSection from '../../PersonalInstruction/Certificate'
import WorkExperience from '../../PersonalInstruction/WorkExperience'
import CompetitionAwardsSection from '../../PersonalInstruction/CompetitionAwards'
import PatentsSection from '../../PersonalInstruction/Patents'
import ExtraSkillSection from '../../PersonalInstruction/ExtraSkill'
import { publicSections, isSectionOnWebsite, type CvLang } from '../../../lib/cvVisibility'
import { SECTION_BY_NAME } from '../../../lib/cvSections'
import { monoFont, useStudioTokens } from './fields'
import type { Section } from './docOps'

/**
 * What a visitor sees in the CV stack on /about, for the language being
 * edited: the same website pruning (publicSections 'website') and the same
 * section components, in the same order, numbered the same way as
 * components/LandingPage/LandingCVSections.
 */

// Sections the /about stack renders (personal info is not part of it).
const RENDERED = ['education', 'workExperience', 'project', 'patents', 'competitionAwards', 'skill', 'extraSkill', 'certification']

function renderSection(section: any, index: number, lang: CvLang) {
  const props = { index, data: section, lang }
  switch (section.sessionName) {
    case 'education':
      return <EducationSection {...props} />
    case 'skill':
      return <SkillSection {...props} />
    case 'certification':
      return <CertificateSection {...props} />
    case 'workExperience':
      return <WorkExperience {...props} />
    case 'competitionAwards':
      return <CompetitionAwardsSection {...props} />
    case 'project':
      return <ProjectSection {...props} />
    case 'patents':
      return <PatentsSection {...props} />
    case 'extraSkill':
      return <ExtraSkillSection {...props} />
    default:
      return null
  }
}

export default function WebsitePreview({ sections, lang }: { sections: Section[]; lang: CvLang }) {
  const { dim, border } = useStudioTokens()
  const shown = useMemo(() => publicSections(sections, 'website').filter((s) => RENDERED.includes(String(s.sessionName))), [sections])
  const off = sections.filter((s) => RENDERED.includes(s.sessionName) && !isSectionOnWebsite(s))

  return (
    <Box bg="page.bg" minH="100%" px={{ base: 3, md: 5 }} py={5}>
      <Flex align="center" gap={3} mb={4}>
        <Text fontFamily={monoFont} fontSize="10px" letterSpacing="0.12em" textTransform="uppercase" color={dim} flexShrink={0}>
          /about · {lang === 'en' ? 'EN' : '中'}
        </Text>
        <Box flex={1} h="1px" bg={border} />
      </Flex>
      {shown.length ? (
        <Flex direction="column">
          {shown.map((section, i) => (
            <React.Fragment key={`${section.sessionName}-${i}`}>{renderSection(section, i + 1, lang)}</React.Fragment>
          ))}
        </Flex>
      ) : (
        <Text fontSize="13px" color={dim} py={8} textAlign="center">
          No CV sections are shown on the website in this language.
        </Text>
      )}
      {off.length ? (
        <Text mt={5} fontSize="11px" color={dim} fontFamily={monoFont}>
          Off the website: {off.map((s) => SECTION_BY_NAME[s.sessionName]?.label || s.sessionName).join(', ')}
        </Text>
      ) : null}
    </Box>
  )
}
