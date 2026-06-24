import React, { useState, useEffect } from 'react'
import { GetServerSideProps } from 'next'
import { Flex, useMediaQuery } from '@chakra-ui/react'

import LandingContent from '../components/LandingPage/LandingContent'
import HeaderFooter from '../layout/HeaderFooter'
import CustomHead from '../components/General-UI/CustomHead'
import { absUrl, websiteNode, personNode } from '../lib/schema'



const LandingPage = (props: any) => {
  // const { data: session } = useSession()

  const [, setIsHostCV] = useState<boolean>(false)
  const [isMobile] = useMediaQuery('(max-width: 767px)')

  useEffect(() => {
    if (props.host && props.host === 'cv.lucian-dev.com') {
      setIsHostCV(true)
    }
  }, [props.host])

  return (
    <>
      <CustomHead
        title="Home"
        description="Li Yanpei (Lucian) — software engineer in Hong Kong building full-stack web apps, machine-learning / computer-vision, and embedded systems. CV, projects, and contact."
        url={absUrl('/')}
        image={(props.home?.photos && props.home.photos.find((p:any)=> p.visible !== false)?.url ?
          absUrl(props.home.photos.find((p:any)=> p.visible !== false)!.url as string)
          : absUrl('/images/hikoAvator.png')) as string}
        type="website"
        jsonLd={[websiteNode(), personNode()]}
      />

      <HeaderFooter isMobile={isMobile}>
        {/* Mobile and desktop share the same composition — LandingContent
            and every child use Chakra responsive props for sizing. */}
        <Flex direction="column" alignItems="center" justifyContent="center" gap={['20px', '40px']}>
          <LandingContent isMobile={isMobile} home={props.home || undefined} cv={props.cv || undefined} />
        </Flex>
      </HeaderFooter>
    </>
  )
}

export default LandingPage

export const getServerSideProps: GetServerSideProps = async (context: any) => {
  const host = context.req.headers.host
  
  // read home config server-side
  let home = null
  try {
    const mod = await import('../lib/home')
    home = mod.readHome()
  } catch {}
  // read live cv data server-side from the content store (SQLite kv + R2) — the
  // same source the admin editor writes via /api/cvdata. (Was reading the static
  // data/cvdata.json seed file, so admin edits never appeared.)
  let en: any[] = []
  let zh: any[] = []
  try {
    const { readCvData } = await import('../lib/cvdata')
    const cv = readCvData()
    en = cv.en
    zh = cv.zh
  } catch {}
  return { props: { host, home, cv: { en, zh } } }
}
