// import { useEffect, useState } from 'react'

// import { CVData } from '../../types/cvProps'
import { Flex, Spinner } from '@chakra-ui/react'
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
  // const [isMobile, setIsMobile] = useState<boolean>(false)

  useEffect(() => {
    if (props?.host && props?.host === 'cv.hiko.dev') {
      setIsHostCV(true)
    }
    setIsLoading(false)
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
        <HeaderFooter isMobile={false}>
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
            <CVResult cvData={cvData} style={{ fontSize: '12px' }} />
          </Flex>
        </HeaderFooter>
      )}
    </React.Fragment>
  )
}
export default CVPage
