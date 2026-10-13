import NextLink from 'next/link'
import { Box, Flex } from '@chakra-ui/react'
import { Project, ProjectExperience } from '../../types/cvProps'
import type { CvLang } from '../../lib/cvVisibility'
import { cvLabels, formatCvRange } from '../../lib/cvFormat'
import { useReferenceMonth } from '../../lib/clock'
import { matchCaseStudy, type WorkIndexItem } from '../LandingPage/projectMatch'
import CVSectionShell, { CVRow, CVBullets } from './_CVSectionShell'

const t = (v: unknown) => (typeof v === 'string' ? v.trim() : '')
const monoFont = 'var(--font-geist-mono), ui-monospace, monospace'

/** The link label per CV language; the case studies themselves are not translated. */
const CASE_STUDY_LABEL: Record<CvLang, string> = { en: 'Case study', zh: '案例研究' }

/**
 * The visible CV project entries, each with the /work case study it refers
 * to (null when none): the owner's `caseStudy` slug when it names an
 * existing case study, else a strict title match (see projectMatch).
 */
export function projectEntries(
  data: Pick<Project, 'projectExperience'> | null | undefined,
  work?: readonly WorkIndexItem[] | null,
): Array<{ project: ProjectExperience; study: WorkIndexItem | null }> {
  const list = Array.isArray(data?.projectExperience) ? data.projectExperience : []
  return list
    .filter((p) => t(p?.title) || t(p?.description))
    .map((project) => ({
      project,
      study: matchCaseStudy({ title: project.title, caseStudy: (project as { caseStudy?: unknown }).caseStudy }, work),
    }))
}

const ProjectSection = ({
  index,
  data,
  lang = 'en',
  work,
}: {
  index?: number
  data: Project
  lang?: CvLang
  /** /work case-study index; a matching project gets a "Case study →" link. */
  work?: readonly WorkIndexItem[]
}) => {
  const month = useReferenceMonth()
  const items = projectEntries(data, work)
  if (!items.length) return null
  return (
    <CVSectionShell
      index={index}
      label={data?.headerName || 'Projects'}
      count={items.length}
      countSuffix={cvLabels(lang).entries}
    >
      <Flex direction="column">
        {items.map(({ project: pro, study }, i) => {
          return (
            <CVRow
              key={i}
              isFirst={i === 0}
              title={t(pro.title) || t(pro.description)}
              subtitle={t(pro.title) ? t(pro.description) || undefined : undefined}
              period={formatCvRange(pro.startDate, pro.endDate, lang, { futureEndAsPresent: true, now: month }) || undefined}
              location={t(pro.projectLocation) || undefined}
            >
              <CVBullets
                items={(pro.features || []).map((fea) => ({
                  description: fea.description,
                  furtherExplanation: fea.furtherExplanation || [],
                }))}
              />
              {study ? (
                <Box mt={(pro.features || []).length > 0 ? 4 : 0} fontFamily={monoFont} fontSize="12px" letterSpacing="0.04em">
                  <Box
                    as={NextLink}
                    href={`/work/${study.slug}`}
                    display="inline-flex"
                    alignItems="center"
                    gap={1.5}
                    minH="24px"
                    color="accent.text"
                    borderRadius="sm"
                    _hover={{ textDecoration: 'underline', textUnderlineOffset: '3px' }}
                    _focusVisible={{ outline: '2px solid var(--accent)', outlineOffset: '2px' }}
                  >
                    {CASE_STUDY_LABEL[lang] || CASE_STUDY_LABEL.en} <span className="nudge" aria-hidden>→</span>
                    <span className="sr-only">: {study.title}</span>
                  </Box>
                </Box>
              ) : null}
            </CVRow>
          )
        })}
      </Flex>
    </CVSectionShell>
  )
}

export default ProjectSection
