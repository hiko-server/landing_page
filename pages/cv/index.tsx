// import { useEffect, useState } from 'react'

// import { CVData } from '../../types/cvProps'
import { Box, Flex, useMediaQuery } from '@chakra-ui/react'
import { useSession } from 'next-auth/react'
import CVResult from '../../components/CVViewerPage/CVResult'
import { cvDataChinese, cvDataEnglish } from '../../example/cvdata'
import React, { useEffect, useState } from 'react'
import HeaderFooter from '../../layout/HeaderFooter'
import CustomHead from '../../components/General-UI/CustomHead'

const CVPage = ({ props }: { props: any }) => {
  console.log('props', props)

  const { data: session, status } = useSession()
  console.log('session', session)
  console.log('status', status)
  console.log(session?.accessToken)

  const [, setIsHostCV] = useState<boolean>(false)
  const [isMobile] = useMediaQuery('(max-width: 768px)')

  useEffect(() => {
    if (props?.host && props?.host === 'cv.hiko.dev') {
      setIsHostCV(true)
    }
  }, [props?.host])
  let cvData
  const [language, setLanguage] = useState('en')
  switch (language) {
    case 'en':
      cvData = cvDataEnglish
      break
    case 'zh':
      cvData = cvDataChinese
      break
    default:
      cvData = cvDataEnglish
  }
  return (
    <React.Fragment>
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
          <div>
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
                '@media print': { transform: 'none !important', width: '100% !important' },
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
