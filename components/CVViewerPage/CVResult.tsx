import React from 'react'
import dynamic from 'next/dynamic'
import { Box, Flex } from '@chakra-ui/react'
import type {
  PersonalInformation,
  Education,
  Skill,
  Project,
  Experiences,
  ExtraSkill,
  CompetitionAwards,
  Certification,
  Patents,
  Publications,
  CVData,
} from '../../types/cvProps'
import type { CvLang } from '../../lib/cvVisibility'
import CertificateSection from './Certification'
import EducationSection from './Education'
import ExtraSkillSection from './ExtraSkill'
import PersonalInformationSection from './PersonalInformation'
import ProjectSection from './Project'
import SkillSection from './Skill'
import WorkExperience from './WorkExperience'
import CompetitionAwardsSection from './CompetitionAwards'
import PatentsSection from './Patents'
import type { OwnerNames } from '../../lib/publications/names'
import { isPublicationStatus } from '../../lib/publications/types'
import { field, list } from './fields'
import CvQr from './CvQr'

// Publications render through their own chunk, fetched only when the CV has the section.
const PublicationsSection = dynamic(() => import('./Publications'))

/**
 * CVResult — the A4 sheet used by /cv, print / Save-as-PDF and the admin
 * Studio preview.
 *
 * Expects *public* data (lib/cvVisibility.ts → publicSections(…, 'cv')), but
 * still drops sections switched off for the CV so an unpruned document can't
 * leak hidden sections into the sheet.
 *
 * Print: the sheet flows in normal document order (so multi-page CVs
 * paginate) and its padding is cloned onto every printed page via
 * box-decoration-break, giving page 2+ a real top margin. Global print rules
 * live in styles/globals.css. With `qr`, a print-only footer carries a QR
 * code to the live CV.
 *
 * Sections and entries carry stable anchor ids (`cv-<sessionName>`,
 * `cv-<sessionName>-<index>`, see ./fields) that search results link to.
 */

export const A4_WIDTH_PX = 794 // 210mm @ 96dpi
export const A4_HEIGHT_PX = 1123 // 297mm @ 96dpi

/** Every section type the sheet can render (pages load exactly these from the public CV). */
export const SHEET_SECTIONS = [
  'personalInformation',
  'education',
  'skill',
  'project',
  'workExperience',
  'competitionAwards',
  'extraSkill',
  'certification',
  'patents',
  'publications',
] as const

function renderSection(section: CVData[number], lang: CvLang, owner: OwnerNames | undefined, all: CVData): React.ReactNode {
  switch (section.sessionName) {
    case 'personalInformation':
      return <PersonalInformationSection data={section as PersonalInformation} lang={lang} />
    case 'education':
      return <EducationSection data={section as Education} lang={lang} />
    case 'skill':
      return <SkillSection data={section as Skill} />
    case 'project':
      return <ProjectSection data={section as Project} lang={lang} />
    case 'workExperience':
      return <WorkExperience data={section as Experiences} lang={lang} />
    case 'competitionAwards':
      return <CompetitionAwardsSection data={section as CompetitionAwards} lang={lang} />
    case 'extraSkill':
      return <ExtraSkillSection data={section as ExtraSkill} />
    case 'certification':
      return <CertificateSection data={section as Certification} lang={lang} />
    case 'patents':
      return <PatentsSection data={section as Patents} lang={lang} />
    case 'publications':
      // Only fetch the chunk when there is a paper to show (a title and a real status, as in lib/publications).
      return list(section, 'papers').some((p) => field(p, 'title') && isPublicationStatus(field(p, 'status'))) ? (
        <PublicationsSection data={section as Publications} lang={lang} owner={owner} sections={all} />
      ) : null
    default:
      return null
  }
}

const CVResult = ({
  cvData,
  lang = 'en',
  style,
  qr,
  ownerNames,
}: {
  cvData: CVData | any[]
  lang?: CvLang
  style?: React.CSSProperties
  /** Print-only QR footer: inline SVG (lib/qr.ts), caption and accessible label. */
  qr?: { svg: string; caption: string; label: string } | null
  /** The owner's name forms (both CV languages) for emphasis in author lists; default: this sheet's Personal Info. */
  ownerNames?: OwnerNames
}) => {
  const sections = (Array.isArray(cvData) ? cvData : []).filter(
    (s: any) => s && typeof s === 'object' && s.isVisible !== false,
  ) as CVData
  const pi = sections.find((s) => s.sessionName === 'personalInformation') as PersonalInformation | undefined
  const sepColor = pi?.separatorColor || 'blue'

  return (
    <Flex className="cv-print-flow" direction="column" alignItems="center" w="100%" style={style}>
      <Box id="print-area" className="cv-print-area">
        <Box
          id="A4Paper"
          as="article"
          lang={lang === 'zh' ? 'zh-Hans' : 'en'}
          bg="white"
          color="#111"
          w={`${A4_WIDTH_PX}px`}
          minH={`${A4_HEIGHT_PX}px`}
          p="20px"
          fontSize="12px"
          lineHeight="1.5"
          boxSizing="border-box"
          style={{ ['--cv-separator-color' as any]: sepColor }}
          sx={{
            fontFamily:
              "'Noto Sans SC', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, 'PingFang SC', 'Microsoft YaHei', sans-serif",
            WebkitPrintColorAdjust: 'exact',
            printColorAdjust: 'exact',
            textRendering: 'optimizeLegibility',
            fontKerning: 'normal',
            'a:hover': { textDecoration: 'underline' },
          }}
        >
          {sections.map((section, index) => (
            <React.Fragment key={`${section.sessionName}-${index}`}>{renderSection(section, lang, ownerNames, sections)}</React.Fragment>
          ))}
          {qr && sections.length ? <CvQr svg={qr.svg} caption={qr.caption} label={qr.label} /> : null}
        </Box>
      </Box>
    </Flex>
  )
}

export default CVResult
