import React from 'react'
import type { ExtraSkill } from '../../types/cvProps'
import { bullets, cvSectionAnchor } from './fields'
import { PlainBullets, SheetSection } from './primitives'

const ExtraSkillSection = ({ data }: { data: ExtraSkill }) => {
  const points = bullets(data, 'points')
  if (!points.length) return null
  return (
    <SheetSection title={data.headerName} id={cvSectionAnchor('extraSkill')}>
      <PlainBullets items={points} />
    </SheetSection>
  )
}
export default ExtraSkillSection
