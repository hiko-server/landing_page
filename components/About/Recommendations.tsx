import type React from 'react'
import { Box, Heading, Link, SimpleGrid, Text } from '@chakra-ui/react'
import { recommendationCredit, recommendationItems } from '../CVViewerPage/recommendationView'

const mono = 'var(--font-geist-mono), ui-monospace, monospace'

/**
 * /about: recommendations (E11) the owner entered with each person's
 * permission, when the CV's Recommendations section is on the website.
 * Renders nothing without a permitted entry. Plain figure / blockquote /
 * figcaption — no Review structured data. `title` replaces the default h2
 * (the page's own section heading); it must carry id="about-recommendations".
 */
export default function AboutRecommendations({ section, title }: { section: unknown; title?: React.ReactNode }) {
  const items = recommendationItems(section)
  if (!items.length) return null
  return (
    <Box as="section" aria-labelledby="about-recommendations" w="100%" maxW="1100px" mx="auto">
      {title ?? (
        <Heading as="h2" id="about-recommendations" mb={6} size="md" fontWeight={500} letterSpacing="-0.01em">
          Recommendations
        </Heading>
      )}
      <SimpleGrid as="ul" listStyleType="none" m={0} p={0} columns={{ base: 1, md: items.length > 1 ? 2 : 1 }} gap={4}>
        {items.map(({ item, index }) => {
          const credit = recommendationCredit(item, 'en')
          return (
            <Box as="li" key={index} minW={0}>
              <Box
                as="figure"
                m={0}
                h="100%"
                display="flex"
                flexDirection="column"
                gap={4}
                border="1px solid"
                borderColor="page.border"
                borderRadius="lg"
                bg="page.bg-elevated"
                px={{ base: 5, md: 6 }}
                py={{ base: 5, md: 6 }}
              >
                <Text as="span" aria-hidden fontFamily="Georgia, 'Times New Roman', serif" fontSize="40px" lineHeight="0.6" color="var(--accent)" h="18px">
                  “
                </Text>
                <Box
                  as="blockquote"
                  m={0}
                  flex="1"
                  fontSize={{ base: '16px', md: '17px' }}
                  lineHeight="1.65"
                  color="page.fg"
                  cite={item.sourceUrl || undefined}
                  sx={{ textWrap: 'pretty' }}
                >
                  {item.quote}
                </Box>
                <Box as="figcaption" fontSize="14px" lineHeight="1.5">
                  <Text as="span" display="block" fontWeight={600} color="page.fg">
                    {item.sourceUrl ? (
                      <Link
                        href={item.sourceUrl}
                        isExternal
                        textDecoration="underline"
                        textUnderlineOffset="3px"
                        textDecorationColor="var(--accent-ring)"
                        _hover={{ textDecorationColor: 'currentColor' }}
                      >
                        {item.name}
                        <span className="sr-only"> (source, opens in a new tab)</span>
                      </Link>
                    ) : (
                      item.name
                    )}
                  </Text>
                  {credit ? (
                    <Text as="span" display="block" fontFamily={mono} fontSize="12px" letterSpacing="0.02em" color="page.fg-secondary" mt={0.5}>
                      {credit}
                    </Text>
                  ) : null}
                </Box>
              </Box>
            </Box>
          )
        })}
      </SimpleGrid>
    </Box>
  )
}
