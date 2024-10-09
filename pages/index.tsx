import { useSession } from 'next-auth/react'
import React, { useState, useEffect } from 'react'
import { GetServerSideProps } from 'next'
import { Avatar, Box, Button, Flex, Spinner, Text } from '@chakra-ui/react'
import CVResult from '../components/CVViewerPage/CVResult'
import { exampleCvData } from '../example/example'
import RootBaseLayout from '../layout/RootBase'
import LandingLayout from '../layout/LandingLayout'
import { useRouter } from 'next/router'
import { Build } from '@mui/icons-material'
import personal_photo from '../public/images/personal_photo.jpg'
import LinkedInBadge from '../components/linkedIn/linkedIn'

const LandingContent = () => {
  const router = useRouter()

  return (
    <React.Fragment>
      <Flex
        padding={'20px'}
        direction={'row'}
        justifyContent={'center'}
        alignItems={'center'}
        gap={'20px'}
      >
        <Flex
          justifyContent={'center'}
          alignItems={'center'}
          gap={'20px'}
          direction={'column'}
        >
           <Avatar size="2xl" name="Hiko" src={personal_photo.src} />

          <Flex
            direction={'column'}
            gap={'5px'}
            justifyContent={'center'}
            alignItems={'center'}
          >
            <Text fontSize={'33px'} >
              <strong>Li Yanpei, Hiko</strong>
              
            </Text>
            <Text fontSize={'33px'} >
            <strong>李彦霈</strong>
              
            </Text>
            <Text fontSize={'15px'}>Contact Phone: 852 62040827</Text>
            <Text fontSize={'15px'}>Email: liyanpei2004@outlook.com</Text>
            <Text fontSize={'15px'}>Mandarin, English</Text>
          </Flex>

          <Button
            size="lg"
            w={'250px'}
            fontSize={'22px'}
            onClick={() => {
              router.push('https://cv.hiko.dev')
            }}
          >
            My CV
          </Button>

          <Button
            size="lg"
            w={'250px'}
            fontSize={'22px'}
            onClick={() => {
              router.push('https://www.linkedin.com/in/yan-pei-li-21ba52263/')
            }}
          >
            LinkedIn
          </Button>

          <Button
            size="lg"
            w={'250px'}
            fontSize={'22px'}
            onClick={() => {
              router.push('https://github.com/HikoPLi')
            }}
          >
            GitHub
          </Button>

          <Button
            size="lg"
            w={'250px'}
            fontSize={'22px'}
            onClick={() => {
              router.push('https://gitlab.com/HikoPLi')
            }}
          >
            GitLab
          </Button>
          <LinkedInBadge/>
        </Flex>

        <Flex direction={'column'}>
          <Flex justifyContent={'center'} alignItems={'center'} gap={'20px'}>
            <Text fontSize={'22px'}>
              Passionate Self-Taught Full-Stack Software Engineer | Exploring
              Innovative Solutions in Computer Science | Typescript | React |
              Next.js | NestJS | Python FastAPI
            </Text>
          </Flex>

          <Flex
            direction={'column'}
            gap={'40px'}
            mt={'100px'}
            justifyContent={'center'}
            alignItems={'center'}
          >
            <Button
              size="lg"
              w={'300px'}
              fontSize={'22px'}
              onClick={() => {
                router.push('/demo')
              }}
            >
              Demo of my work
            </Button>
            <Button
              size="lg"
              w={'300px'}
              fontSize={'22px'}
              rightIcon={<Build />}
              onClick={() => {
                router.push('https://hiko.dev/cv/edit')
              }}
            >
              CV Generator{' '}
            </Button>
          </Flex>
        </Flex>
      </Flex>
    </React.Fragment>
  )
}

const LandingPage = (props: any) => {
  console.log('props', props)

  const { data: session, status } = useSession()
  console.log('session', session)
  console.log('status', status)
  console.log(session?.accessToken)

  const [isHostCV, setIsHostCV] = useState<boolean>(false)
  const [isLoading, setIsLoading] = useState<boolean>(true)
  const [isMobile, setIsMobile] = useState<boolean>(false)

  useEffect(() => {
    if (props.host && props.host === 'cv.hiko.dev') {
      setIsHostCV(true)
    }
    setIsLoading(false)

    const mediaQuery = window.matchMedia('(max-width: 767px)')
    setIsMobile(mediaQuery.matches)

    const handleResize = (e: MediaQueryListEvent) => {
      setIsMobile(e.matches)
    }

    mediaQuery.addEventListener('change', handleResize)

    return () => {
      mediaQuery.removeEventListener('change', handleResize)
    }
  }, [])

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
      ) : isHostCV ? (
        exampleCvData !== undefined && (
          <CVResult cvData={exampleCvData} style={{ fontSize: '12px' }} />
        )
      ) : (
        <RootBaseLayout>
          <LandingLayout>
            {isMobile ? (
              <DisplayMobileInfo />
            ) : (
              <LandingContent />
            )}
          </LandingLayout>
        </RootBaseLayout>
      )}
    </React.Fragment>
  )
}

export default LandingPage

export const getServerSideProps: GetServerSideProps = async (context: any) => {
  const host = context.req.headers.host
  console.log({ host })
  return {
    props: { host: host }, // will be passed to the page component as props
  }
}

const DisplayMobileInfo = () => {
  const router = useRouter()
  const [screenSize, setScreenSize] = useState('');
  const [browserInfo, setBrowserInfo] = useState('');
  const [ipInfo, setIpInfo] = useState('');

  useEffect(() => {
    setScreenSize(`${window.screen.width} x ${window.screen.height}`);
    setBrowserInfo(window.navigator.userAgent);
    setIpInfo(window.location.host);
  }, []);

  return (
    <Box mt={4}>
      <Text><strong>This site cannot be displayed on mobile phones.</strong></Text>
      <Text><strong>For more information, you can visit:</strong></Text>
      <Flex direction="column" gap={3} alignItems="center">
        <LinkedInBadge/>
        <Button
          size="lg"
          fontSize="15px"
          onClick={() => {
            router.push('https://www.linkedin.com/in/yan-pei-li-21ba52263/');
          }}
        >
          LinkedIn
        </Button>

        <Button
          size="lg"
          fontSize="15px"
          onClick={() => {
            router.push('https://github.com/HikoPLi');
          }}
        >
          GitHub
        </Button>

        <Button
          size="lg"
          fontSize="15px"
          onClick={() => {
            router.push('https://gitlab.com/HikoPLi');
          }}
        >
          GitLab
        </Button>
      </Flex>
      <Text mt={4}><strong>Current Screen Size:</strong> {screenSize}</Text>
      <Text><strong>Suggested Screen Size:</strong> 1920 x 1080</Text>
      <Text><strong>Browser Info:</strong> {browserInfo}</Text>
      <Text><strong>IP Info:</strong> {ipInfo}</Text>
    </Box>
  );
};
