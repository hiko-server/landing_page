// import { useEffect, useState } from 'react'

// import { CVData } from '../../types/cvProps'
import { Box, Flex, Spinner } from '@chakra-ui/react'
import { useSession } from 'next-auth/react'
import CVResult from '../../components/CVViewerPage/CVResult'
import { cvDataChinese, cvDataEnglish } from '../../example/cvdata'
import React, { useEffect, useState } from 'react'
import HeaderFooter from '../../layout/HeaderFooter'

const CVPage = ({ props }: { props: any }) => {
  console.log('props', props)

  const { data: session, status } = useSession()
  console.log('session', session)
  console.log('status', status)
  console.log(session?.accessToken)

  const [, setIsHostCV] = useState<boolean>(false)
  const [isLoading, setIsLoading] = useState<boolean>(true)
  const [isMobile, setIsMobile] = useState<boolean>(false)

  useEffect(() => {
    if (props?.host && props?.host === 'cv.hiko.dev') {
      setIsHostCV(true)
    }
    setIsLoading(false)

    const handleResize = () => {
      setIsMobile(window.innerWidth <= 768)
    }

    window.addEventListener('resize', handleResize)
    handleResize()

    return () => {
      window.removeEventListener('resize', handleResize)
    }
  }, [])
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
      {isLoading ? (
        <Flex
          h={'100vh'}
          w={'100vw'}
          alignItems={'center'}
          justifyContent={'center'}
        >
          <Spinner size="xl" />
        </Flex>
      ) : (
        <HeaderFooter isMobile={isMobile}>
          <Flex
            direction="column"
            alignItems="center"
            justifyContent="center"
            p={['20px', '40px']}
            gap={['20px', '40px']}
          >
            {' '}
            <div>
              <label htmlFor="language-select">Select Language: </label>
              <select
                id="language-select"
                value={language}
                onChange={(e) => setLanguage(e.target.value)}
              >
                <option value="en">English</option>
                <option value="zh">Chinese</option>
              </select>
            </div>
            <Box
              w="full"
              overflowX="scroll"
              // position="relative"
              minH={isMobile ? '140vh' : '100vh'}  // 增加最小高度适应缩放
            >
              <Box
                w={isMobile ? '125%' : '100%'}
                transform={isMobile ? 'scale(0.8)' : 'none'}
                transformOrigin="top left"
                sx={{
                  transition: 'transform 0.3s ease',
                  '@media print': {  // 打印时保持原始尺寸
                    transform: 'none !important',
                    width: '100% !important'
                  }
                }}
              >
                <CVResult 
                  cvData={cvData} 
                  style={{ 
                    fontSize: isMobile ? '10px' : '12px',
                    minWidth: isMobile ? '800px' : 'auto'  // 保持CV最小宽度
                  }} 
                />
              </Box>
            </Box>
          </Flex>
        </HeaderFooter>
      )}
    </React.Fragment>
  )
}
export default CVPage
