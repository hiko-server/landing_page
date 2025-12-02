// import { useEffect, useState } from 'react'

// import { CVData } from '../../types/cvProps'
import { Box, Flex, useMediaQuery } from '@chakra-ui/react'
import CVResult from '../../components/CVViewerPage/CVResult'
// import { cvDataChinese, cvDataEnglish } from '../../example/cvdata'
import React, { useEffect, useState } from 'react'
import HeaderFooter from '../../layout/HeaderFooter'
import CustomHead from '../../components/General-UI/CustomHead'
import Head from 'next/head'

const CVPage = ({ props, en, zh }: { props: any; en: any[]; zh: any[] }) => {

  const [, setIsHostCV] = useState<boolean>(false)
  // Stabilize SSR/CSR layout to avoid flicker when landing directly on /cv
  const [isMobile] = useMediaQuery('(max-width: 768px)', { ssr: true, fallback: false })

  useEffect(() => {
    if (props?.host && props?.host === 'cv.hiko.dev') {
      setIsHostCV(true)
    }
  }, [props?.host])
  let cvData
  const [language, setLanguage] = useState('en')
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
  return (
    <React.Fragment>
      {/* Preload Chinese font to keep layout stable and print crisp */}
      <Head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Noto+Sans+SC:wght@400;500;700&display=swap"
          rel="stylesheet"
        />
      </Head>
      <CustomHead
        title="CV / Resume"
        description="Hiko’s CV with skills matrix, timeline, and downloadable PDF."
        url={`https://${props?.host || 'hiko.dev'}/cv`}
        image="/images/hikoAvator.png"
        type="article"
        jsonLd={[
          {
            '@context': 'https://schema.org',
            '@type': 'CreativeWork',
            name: 'Resume of Li Yanpei (Hiko)',
            url: `https://${props?.host || 'hiko.dev'}/cv`,
            author: {
              '@type': 'Person',
              name: 'Li Yanpei (Hiko)',
            },
          },
        ]}
      />

      <HeaderFooter isMobile={isMobile}>
        <Flex direction="column" alignItems="center" justifyContent="center" p={['20px', '40px']} gap={['20px', '40px']}>
          <div className="no-print">
            <label htmlFor="language-select">Select Language: </label>
            <select id="language-select" value={language} onChange={(e) => setLanguage(e.target.value)}>
              <option value="en">English</option>
              <option value="zh">Chinese</option>
            </select>
          </div>
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
