import React from 'react'
import { Box, Flex, Text } from '@chakra-ui/react'
import type { Skill } from '../../types/cvProps'
import { cleanList } from '../../lib/cvFormat'
import { PlainBullets, SheetSection } from './primitives'

const t = (v: unknown) => (typeof v === 'string' ? v.trim() : '')

const SkillSection = ({ data }: { data: Skill }) => {
  const langs = (data.languages || []).filter((l) => t(l.language) || t(l.level))
  const techs = (data.technical || []).filter((g) => t(g.name) || cleanList(g.description).length)
  if (!langs.length && !techs.length) return null
  return (
    <SheetSection title={data.headerName}>
      <Flex direction="column" gap="14px">
        {langs.length ? (
          <Box display="grid" gridTemplateColumns="max-content 1fr" columnGap="12px" rowGap="4px" fontSize="12px" lineHeight="1.5">
            {langs.map((lang, index) => (
              <React.Fragment key={index}>
                <Text fontWeight={800}>{lang.language}</Text>
                <Text>{lang.level}</Text>
              </React.Fragment>
            ))}
          </Box>
        ) : null}
        {techs.map((tech, i) => (
          <Box key={i} sx={{ breakInside: 'avoid', pageBreakInside: 'avoid' }}>
            {t(tech.name) ? (
              <Text fontWeight={800} fontSize="12px" lineHeight="1.5">
                {tech.name.toUpperCase()}
              </Text>
            ) : null}
            <PlainBullets items={tech.description} />
          </Box>
        ))}
      </Flex>
    </SheetSection>
  )
}
export default SkillSection
