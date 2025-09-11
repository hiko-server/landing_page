// import { useSession } from 'next-auth/react'
import React, { useState, useEffect } from 'react'
import { GetServerSideProps } from 'next'
import { Flex, useMediaQuery } from '@chakra-ui/react'

import DisplayMobileInfo from '../components/mobileDisplay/mobileDisplay'
import LandingContent from '../components/LandingPage/LandingContent'
import HeaderFooter from '../layout/HeaderFooter'
import CustomHead from '../components/General-UI/CustomHead'



const LandingPage = (props: any) => {
  // const { data: session } = useSession()

  const [, setIsHostCV] = useState<boolean>(false)
  const [isMobile] = useMediaQuery('(max-width: 767px)')

  useEffect(() => {
    if (props.host && props.host === 'cv.hiko.dev') {
      setIsHostCV(true)
    }
  }, [props.host])

  return (
    <>
      <CustomHead
        title="Home"
        description="Hiko — Full-stack engineer. View CV, projects, and contact."
        url={`https://${props.host}`}
        image={(props.home?.photos && props.home.photos.find((p:any)=> p.visible !== false)?.url ?
          ((props.home.photos.find((p:any)=> p.visible !== false)!.url as string).startsWith('http')
            ? props.home.photos.find((p:any)=> p.visible !== false)!.url
            : `https://${props.host}${props.home.photos.find((p:any)=> p.visible !== false)!.url}`)
          : '/images/hikoAvator.png') as string}
        type="website"
        jsonLd={[
          {
            '@context': 'https://schema.org',
            '@type': 'WebSite',
            name: 'HIKO.DEV',
            url: `https://${props.host}`,
          },
          {
            '@context': 'https://schema.org',
            '@type': 'Person',
            name: 'Li Yanpei (Hiko)',
            url: `https://${props.host}`,
            sameAs: [
              'https://github.com/HikoPLi',
              'https://gitlab.com/HikoPLi',
              'https://www.linkedin.com/in/liyanpeihiko/',
            ],
            jobTitle: 'Software Engineer',
          },
        ]}
      />

      <HeaderFooter isMobile={isMobile}>
        {isMobile ? (
          <DisplayMobileInfo isMobile={isMobile} setIsMobile={() => {}} />
        ) : (
          <Flex direction="column" alignItems="center" justifyContent="center" gap={['20px', '40px']}>
            <LandingContent isMobile={isMobile} home={props.home || undefined} cv={props.cv || undefined} />
          </Flex>
        )}
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
  // read cv data server-side (reuse logic from /cv)
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
    // No example fallback — use only real data if present
  } catch {}
  return { props: { host, home, cv: { en, zh } } }
}
