// import { useEffect, useState } from 'react'

// import { CVData } from '../../types/cvProps'
import {
  Badge,
  Box,
  Button,
  ButtonGroup,
  Flex,
  Heading,
  Stack,
  Text,
  useColorModeValue,
  useMediaQuery,
} from '@chakra-ui/react'
import CVResult from '../../components/CVViewerPage/CVResult'
// import { cvDataChinese, cvDataEnglish } from '../../example/cvdata'
import { useState } from 'react'
import HeaderFooter from '../../layout/HeaderFooter'
import CustomHead from '../../components/General-UI/CustomHead'
import { getDefaultSeoImage, getSiteUrl } from '../../lib/seo'
import SectionStatusCard from '../../components/General-UI/SectionStatusCard'

const CVPage = ({ props, en, zh }: { props: any; en: any[]; zh: any[] }) => {
  // Stabilize SSR/CSR layout to avoid flicker when landing directly on /cv
  const [isMobile] = useMediaQuery('(max-width: 768px)', { ssr: true, fallback: false })
  const siteUrl = getSiteUrl(props?.host)
  const panelBg = useColorModeValue('whiteAlpha.900', 'blackAlpha.450')
  const panelBorder = useColorModeValue('blackAlpha.100', 'whiteAlpha.200')
  const mutedText = useColorModeValue('gray.600', 'gray.300')
  let cvData
  const [language, setLanguage] = useState('en')
  const hasChinese = Array.isArray(zh) && zh.length > 0
  switch (language) {
    case 'en':
      cvData = en
      break
    case 'zh':
      cvData = zh
      break
    default:
      cvData = en
  }
  const hasCvData = Array.isArray(cvData) && cvData.length > 0
  return (
    <React.Fragment>
      <CustomHead
        title="CV / Resume"
        description="Hiko’s CV with skills matrix, timeline, and downloadable PDF."
        url={`${siteUrl}/cv`}
        image={getDefaultSeoImage(props?.host)}
        imageAlt="Hiko CV preview"
        type="article"
        jsonLd={[
          {
            '@context': 'https://schema.org',
            '@type': 'CreativeWork',
            name: 'Resume of Li Yanpei (Hiko)',
            url: `${siteUrl}/cv`,
            author: {
              '@type': 'Person',
              name: 'Li Yanpei (Hiko)',
            },
          },
        ]}
      />

      <HeaderFooter isMobile={isMobile}>
        <Flex direction="column" alignItems="center" justifyContent="center" p={['20px', '40px']} gap={['20px', '32px']} w="full">
          <Stack
            spacing={4}
            w="full"
            maxW="1100px"
            bg={panelBg}
            borderWidth="1px"
            borderColor={panelBorder}
            borderRadius="2xl"
            p={['16px', '20px', '24px']}
            className="no-print"
            backdropFilter="blur(12px)"
          >
            <Badge colorScheme="teal" alignSelf="flex-start" px={3} py={1} borderRadius="full">
              Interactive CV viewer
            </Badge>
            <Heading size={isMobile ? 'md' : 'lg'}>Browse Hiko’s CV in your preferred language</Heading>
            <Text color={mutedText}>
              Switch between English and Chinese, review the same structured resume online,
              and use the download button inside the CV to print or save a PDF copy.
            </Text>
            <Flex
              direction={{ base: 'column', md: 'row' }}
              justify="space-between"
              align={{ base: 'flex-start', md: 'center' }}
              gap={4}
            >
              <ButtonGroup isAttached={false} variant="outline" flexWrap="wrap">
                <Button
                  colorScheme={language === 'en' ? 'teal' : 'gray'}
                  variant={language === 'en' ? 'solid' : 'outline'}
                  onClick={() => setLanguage('en')}
                >
                  English
                </Button>
                <Button
                  colorScheme={language === 'zh' ? 'teal' : 'gray'}
                  variant={language === 'zh' ? 'solid' : 'outline'}
                  onClick={() => setLanguage('zh')}
                  isDisabled={!hasChinese}
                >
                  中文
                </Button>
              </ButtonGroup>
              <Text fontSize="sm" color={mutedText}>
                {isMobile
                  ? 'Tip: on mobile, scroll horizontally to inspect the full document layout.'
                  : 'Tip: the page preserves the printable A4 layout while remaining browsable on desktop.'}
              </Text>
            </Flex>
          </Stack>
          {hasCvData ? (
            <Box w="full" overflowX="scroll" minH={isMobile ? '140vh' : '100vh'}>
              <Box
                w={isMobile ? '125%' : '100%'}
                transform={isMobile ? 'scale(0.8)' : 'none'}
                transformOrigin="top left"
                sx={{
                  transition: 'transform 0.3s ease',
                  '@media print': { transform: 'none !important', width: '100% !important', position: 'static !important' },
                }}
              >
                <CVResult
                  cvData={cvData}
                  style={{ fontSize: isMobile ? '10px' : '12px', minWidth: isMobile ? '800px' : 'auto' }}
                />
              </Box>
            </Box>
          ) : (
            <Box w="full" maxW="1100px">
              <SectionStatusCard
                title="CV data is not available for this language"
                description="The selected resume content has not been added yet. Switch languages or use the contact page if you need the latest version directly."
              />
            </Box>
          )}
        </Flex>
      </HeaderFooter>
    </React.Fragment>
  )
}
export default CVPage
export const getServerSideProps = async (context: any) => {
  const host = context.req.headers.host || 'hiko.dev'
  const fs = await import('fs')
  const path = await import('path')
  const dataPath = path.join(process.cwd(), 'data', 'cvdata.json')
  let en: any[] = []
  let zh: any[] = []
  try {
    const raw = fs.readFileSync(dataPath, 'utf-8') as unknown as string
    const json = JSON.parse(raw)
    en = json.en || []
    zh = json.zh || []
  } catch {}
  // No example fallback — surface only real data
  return { props: { props: { host }, en, zh } }
}
