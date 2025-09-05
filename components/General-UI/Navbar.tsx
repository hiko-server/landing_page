import React, { useState, useContext, useEffect } from 'react'
import {
  Flex,
  Image,
  // useDimensions,
} from '@chakra-ui/react'

import Icon from '@mdi/react'
import { mdiMenu } from '@mdi/js'
// import styled from '@emotion/styled'
// import Image from 'next/image'

import { VPColor } from '../../theme/color'
// import { AppContext } from '../context/state'

import { AppContext, AppActions } from '../../context/state'
// import styled from 'styled-components'
import { navbarHeight, sidebarWidth } from '../../theme/constant'
import { useMediaQuery } from 'react-responsive'

// const developementMode =
//   process.env.NEXT_PUBLIC_PRODUCTION_MODE === 'development'

// import {
//   BusinessContext,
//   BusinessStateActions,
// } from '../context/BusinessContext'
// import LanguageSwitchButton from '../components/LanguageSwitchButton'

// import { cabiaiColor } from '../theme/color'

// interface NavProps {
//   user?: any
//   // givenName?: string
//   // familyName?: string
// }

// const Navbar = ({ user }: NavProps) => {
const Navbar = ({
  backURL,
  willBack = false,
}: // auth,
{
  title?: string
  willBack: boolean
  backURL?: string
  style?: React.CSSProperties
  // auth: boolean | undefined
}) => {
  // const Navbar = ({ user, auth }: { user?: NavProps; auth?: boolean }) => {
  // const [isSigningOut, setIsSigningOut] = useState(false)
  // const [displaySideNav, setDisplaySideNav] = useState(true);
  // const navbarRef = useRef(null)
  // const dimensions = useDimensions(navbarRef)
  // const appData = useContext(AppContext)
  const appData = useContext(AppContext)
  const [isCollapsed, setIsCollapsed] = useState(true)
  const isMobileDevice = useMediaQuery({ query: '(max-width: 900px)' })

  useEffect(() => {
    appData.dispatch({
      type: AppActions.UPDATE_SIDEBARCOLLAPSED,
      sidebarCollapsed: isCollapsed,
    })

    // localStorage.setItem('isCollapsed', isCollapsed.toString())
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isCollapsed])

  useEffect(() => {
    if (appData.state.sidebarCollapsed !== isCollapsed) {
      setIsCollapsed((_prev) => (_prev = appData.state.sidebarCollapsed))
      // appData.dispatch({
      //   type: AppActions.UPDATE_SIDEBARDRAWERCOLLAPSED,
      //   sidebarDrawerCollapsed: false,
      // })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [appData.state.sidebarCollapsed])

  console.log('isCollapsed', isCollapsed)

  if (willBack) {
    console.log('willBack is exist, backURL is', backURL)
  } else {
    console.log('no willBack button')
  }

  return (
    <Flex
      zIndex={99998}
      pl={'16px'}
      pr={'16px'}
      minW={
        isMobileDevice
          ? `100&`
          : // : isCollapsed
            // ? `${navbarHeight}px`
            `${sidebarWidth}px`
      }
      maxW={
        isMobileDevice
          ? `100vw`
          : isCollapsed
          ? `${navbarHeight}px`
          : `${sidebarWidth}px`
      }
      minH={`${navbarHeight}px`}
      maxH={`${navbarHeight}px`}
      background={
        'linear-gradient(90deg, rgba(255,255,255,1) 0%, rgba(209,161,65,1) 74%, rgba(209,161,65,1) 100%)'
      }
      // top={'0px'}
      // position={'sticky'}
      justifyContent={'center'}
      alignItems={'center'}
    >
      <Flex
        justifyContent={'flex-start'}
        alignItems={'center'}
        w={'100%'}
        gap={!isMobileDevice ? '8px' : !isCollapsed ? '8px' : '0px'}
      >
        <Flex
          // p={'8px'}
          alignItems={'center'}
          color={VPColor.grey}
          _hover={{
            color: VPColor.index.blue,
            bgColor: '#dcdcdc4c',
            cursor: 'pointer',
          }}
          onClick={() =>
            isMobileDevice && setIsCollapsed((_prev) => (_prev = !isCollapsed))
          }
        >
          <Flex
            w={'24px'}
            h={'24px'}
            justifyContent={'center'}
            alignItems={'center'}
          >
            {/* <HamburgerIcon /> */}
            <Icon path={mdiMenu} size={0.8} color="#000000" />
          </Flex>
        </Flex>
        {isMobileDevice ? (
          !isCollapsed && (
            // <Box
            //   // maxWidth={'100%'}

            //   maxH={`${navbarHeight}px`}
            //   // maxW={`calc(100vw - 32px - ${navbarHeight}px`}
            //   position="relative"
            //   onClick={() => router.push('/')}
            //   cursor={'pointer'}
            // >
            <Image
              // priority
              maxH={`calc(${navbarHeight}px - 40px)`}
              alt={'EB'}
              // lazyRoot={lazyRoot}
              src={
                'https://dev.eatmatye.com/_next/image?url=%2F_next%2Fstatic%2Fimages%2FEB-logo%20final_word-caa8c6252bf9418c72337e265c937b71.png&w=1920&q=75'
              }
              objectFit="contain"
              // width="100%"
              // layout="responsive"
              // layout="fixed"
            />
            // </Box>
          )
        ) : (
          <Image
            maxH={`calc(${navbarHeight}px - 40px)`}
            alt={'EB'}
            src={
              'https://lh3.googleusercontent.com/pw/AIL4fc-377xV5yWTOVgbN1iso1u_U63iyznoFUPdbK0EJfkhqdwjsL7sewjV5rYn-v5Pfqzv7fS_nHkVurSZ5xVgXPqVvC7jfcOUQIiQIVA0bWU7rILpZXpc7m7uKdmj6cdgt8IhSfzgkTiuK0EF8wOQMZtVRg'
            }
            objectFit="contain"
          />
        )}
      </Flex>
    </Flex>
  )
}

export default Navbar
