import { useSession } from 'next-auth/react'
import React, { useEffect, useState } from 'react'

import LandingCVSections from '../../components/LandingPage/LandingCVSections'
import { Flex, useMediaQuery } from '@chakra-ui/react'
import HeaderFooter from '../../layout/HeaderFooter'
import CustomHead from '../../components/General-UI/CustomHead'

const About = (props: any) => {
  console.log('props', props)

  const { data: session, status } = useSession()
  console.log('session', session)
  console.log('status', status)
  console.log(session?.accessToken)

  const [, setIsHostCV] = useState<boolean>(false)
  const [isMobile] = useMediaQuery('(max-width: 767px)')

  useEffect(() => {
    if (props.host && props.host === 'cv.hiko.dev') {
      setIsHostCV(true)
    }
  }, [props.host])

  return (
    <React.Fragment>
      <CustomHead
        title="About"
        description="About Hiko — background, skills, and interests."
        url={`https://${props.host || 'hiko.dev'}/about`}
        image="/images/hikoAvator.png"
      />
      <HeaderFooter isMobile={isMobile}>
        <Flex direction="column" alignItems="center" justifyContent="center" p={['20px', '40px']} gap={['20px', '40px']}>
          <LandingCVSections en={props.cv?.en} zh={props.cv?.zh} />
        </Flex>
      </HeaderFooter>
    </React.Fragment>
  )
}

export default About
export async function getServerSideProps(context: any) {
  const host = context.req.headers.host || 'hiko.dev'
  let en: any[] = []
  let zh: any[] = []
  try {
    const fs = await import('fs')
    const path = await import('path')
    const dataPath = path.join(process.cwd(), 'data', 'cvdata.json')
    try {
      const raw = fs.readFileSync(dataPath, 'utf-8') as unknown as string
      const json = JSON.parse(raw)
      en = json.en || []
      zh = json.zh || []
    } catch {}
    if (!en.length || !zh.length) {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const example = require('../../example/cvdata')
      if (!en.length) en = example.cvDataEnglish
      if (!zh.length) zh = example.cvDataChinese
    }
  } catch {}
  return { props: { host, cv: { en, zh } } }
}
