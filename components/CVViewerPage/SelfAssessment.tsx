import { Text } from '@chakra-ui/react'
import { bullets, cvSectionAnchor, field } from './fields'
import { PlainBullets, SheetSection } from './primitives'

/**
 * A4 sheet: the self-assessment (自我评价, E10) — a short statement and/or
 * points. Renders nothing until the owner writes one.
 */
const SelfAssessmentSection = ({ data }: { data: { headerName?: string; [k: string]: unknown } }) => {
  const text = field(data, 'text')
  const points = bullets(data, 'points')
  if (!text && !points.length) return null
  return (
    <SheetSection title={data.headerName} id={cvSectionAnchor('selfAssessment')}>
      {text ? (
        <Text fontSize="12px" lineHeight="1.55" whiteSpace="pre-line">
          {text}
        </Text>
      ) : null}
      <PlainBullets items={points} />
    </SheetSection>
  )
}

export default SelfAssessmentSection
