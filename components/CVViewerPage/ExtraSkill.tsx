import React from 'react'
import type { ExtraSkill } from '../../types/cvProps'
import { cleanList } from '../../lib/cvFormat'
import { PlainBullets, SheetSection } from './primitives'

const ExtraSkillSection = ({ data }: { data: ExtraSkill }) => {
  if (!cleanList(data.points).length) return null
  return (
    <SheetSection title={data.headerName}>
      <PlainBullets items={data.points} />
    </SheetSection>
  )
}
export default ExtraSkillSection
