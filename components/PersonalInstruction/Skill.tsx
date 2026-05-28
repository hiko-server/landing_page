import React from 'react'
import { Box, Flex, Text, useColorModeValue } from '@chakra-ui/react'
import { Skill } from '../../types/cvProps'
import CVSectionShell from './_CVSectionShell'

/**
 * Skill section — different shape from the other CV sections:
 *   - Top half:  "Languages" list (lang + proficiency)
 *   - Bottom:    "Technical Skills" grid (tech category + bullets)
 *
 * We bypass <CVRow> here because skills are categorised, not chronological,
 * and want a tighter two-column layout instead of date-on-right.
 */

const monoFont = 'var(--font-geist-mono), ui-monospace, monospace'

const SkillSection = ({
  index,
  data,
}: {
  index?: number
  data: Skill
}) => {
  const subColor = useColorModeValue('gray.600', 'gray.400')
  const labelColor = useColorModeValue('gray.600', 'gray.500')
  const divider = useColorModeValue('rgba(0,0,0,0.08)', 'rgba(255,255,255,0.08)')
  const bulletColor = useColorModeValue('gray.700', 'gray.300')
  const techBg = useColorModeValue('rgba(0,0,0,0.025)', 'rgba(255,255,255,0.03)')
  const techBorder = useColorModeValue('rgba(0,0,0,0.06)', 'rgba(255,255,255,0.07)')

  const langs = data?.languages || []
  const techs = data?.technical || []
  const totalCount = langs.length + techs.length

  return (
    <CVSectionShell
      index={index}
      label={data?.headerName || 'Skills'}
      count={totalCount}
      countSuffix="ITEMS"
    >
      <Flex direction="column" gap={8}>
        {/* Languages */}
        {langs.length > 0 && (
          <Box>
            <Flex align="center" gap={3} mb={3}>
              <Text
                fontFamily={monoFont}
                fontSize="11px"
                letterSpacing="0.08em"
                color={labelColor}
                textTransform="uppercase"
              >
                Languages
              </Text>
              <Box flex="1" h="1px" bg={divider} />
            </Flex>
            <Flex direction="column" gap={2}>
              {langs.map((lang, i) => (
                <Flex
                  key={i}
                  justify="space-between"
                  align="baseline"
                  borderBottom={i === langs.length - 1 ? undefined : '1px solid'}
                  borderColor={divider}
                  pb={2}
                >
                  <Text fontSize="14px" fontWeight={500}>
                    {lang.language}
                  </Text>
                  <Text
                    fontFamily={monoFont}
                    fontSize="11px"
                    color={subColor}
                    letterSpacing="0.04em"
                  >
                    {lang.level}
                  </Text>
                </Flex>
              ))}
            </Flex>
          </Box>
        )}

        {/* Technical */}
        {techs.length > 0 && (
          <Box>
            <Flex align="center" gap={3} mb={3}>
              <Text
                fontFamily={monoFont}
                fontSize="11px"
                letterSpacing="0.08em"
                color={labelColor}
                textTransform="uppercase"
              >
                Technical
              </Text>
              <Box flex="1" h="1px" bg={divider} />
            </Flex>
            <Box
              display="grid"
              gridTemplateColumns={['1fr', '1fr 1fr']}
              gap={3}
            >
              {techs.map((tech, i) => (
                <Box
                  key={i}
                  p={4}
                  border="1px solid"
                  borderColor={techBorder}
                  bg={techBg}
                  borderRadius="4px"
                >
                  <Text
                    fontFamily={monoFont}
                    fontSize="11px"
                    letterSpacing="0.08em"
                    color="var(--accent)"
                    textTransform="uppercase"
                    mb={2}
                  >
                    {tech.name}
                  </Text>
                  <Flex direction="column" gap={1}>
                    {tech.description.map((des, j) => (
                      <Flex key={j} gap={2} align="flex-start">
                        <Box
                          w="3px"
                          h="3px"
                          mt="9px"
                          borderRadius="full"
                          bg={bulletColor}
                          opacity={0.5}
                          flexShrink={0}
                        />
                        <Text fontSize="13px" color={bulletColor} lineHeight="1.55">
                          {des}
                        </Text>
                      </Flex>
                    ))}
                  </Flex>
                </Box>
              ))}
            </Box>
          </Box>
        )}
      </Flex>
    </CVSectionShell>
  )
}

export default SkillSection
