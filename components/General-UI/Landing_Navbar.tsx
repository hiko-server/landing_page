import React, { useState, useContext, useEffect } from 'react'
import {
  Box,
  // Avatar,
  Menu,
  MenuButton,
  MenuList,
  MenuItem,
  // Spinner,
  // useToast,
  Text,
  Flex,
  // useDimensions,
} from '@chakra-ui/react'

import Icon from '@mdi/react'
import { mdiMenu } from '@mdi/js'
import { useRouter } from 'next/router'
// import styled from '@emotion/styled'

// import EBLogo from '../../public/images/EB-logo_2021_word_transparent.png'
// import { VPColor } from '../theme/color'
// import { AppContext } from '../context/state'

import { AppContext, AppActions } from '../../context/state'
// import { HamburgerIcon } from '@chakra-ui/icons'
// import { logout } from '../services/logout_service'
// import styled from 'styled-components'

import { ChevronLeft } from '@mui/icons-material'

const developementMode =
  process.env.NEXT_PUBLIC_PRODUCTION_MODE === 'development'

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
const Landing_Navbar = ({
  title,
  backURL,
  willBack = false,
  style,
}: // auth,
{
  title?: string
  willBack: boolean
  backURL?: string
  style?: React.CSSProperties
  // auth: boolean | undefined
}) => {
  // const Navbar = ({ user, auth }: { user?: NavProps; auth?: boolean }) => {
  const router = useRouter()
  // const [isSigningOut, setIsSigningOut] = useState(false)
  // const [displaySideNav, setDisplaySideNav] = useState(true);
  // const toast = useToast()
  // const navbarRef = useRef(null)
  // const dimensions = useDimensions(navbarRef)
  // const appData = useContext(AppContext)
  const appData = useContext(AppContext)
  const [
    isCollapsed,
    // setIsCollapsed
  ] = useState(appData.state.sidebarCollapsed)
  // const lazyRoot = React.useRef(null)
  const titleL = title == undefined ? '' : title

  // console.log('auth', auth)
  // useEffect(() => {
  //   console.log('navbar height', dimensions?.borderBox.height)
  //   appData.dispatch({
  //     type: AppActions.UPDATE_NAVBARHEIGHT,
  //     navbarHeight:
  //       dimensions?.borderBox.height != undefined
  //         ? dimensions?.borderBox.height
  //         : 56,
  //   })
  // }, [dimensions])
  useEffect(() => {
    // console.log('isCollapsed', isCollapsed)
    appData.dispatch({
      type: AppActions.UPDATE_SIDEBARCOLLAPSED,
      sidebarCollapsed: isCollapsed,
    })
    // console.log('isCollapsed', isCollapsed)
    // console.log(
    //   'appData.state.sidebarCollapsed',
    //   appData.state.sidebarCollapsed
    // )

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isCollapsed])

  if (willBack) {
    console.log('willBack is exist, backURL is', backURL)
  } else {
    console.log('no willBack button')
  }

  return (
    // <Container>
    // <Box ref={navbarRef}>
    // <React.Fragment>
    <Flex
      zIndex={1999}
      p={'20px'}
      h={'56px'}
      background={
        'linear-gradient(90deg, rgba(255,255,255,1) 0%, rgba(209,161,65,1) 74%, rgba(209,161,65,1) 100%)'
      }
      top={'0px'}
      position={'sticky'}
      justifyContent={'space-between'}
      alignItems={'center'}
      w={'100%'}
    >
      <Flex
        justifyContent={'flex-start'}
        alignItems={'center'}
        w={'100%'}
        gap={'5px'}
      >
        <Box
        //  flexGrow={1}
        >
          {/* <Flex
            p={'8px'}
            alignItems={'center'}
            color={VPColor.grey}
            _hover={{
              color: VPColor.index.blue,
              bgColor: '#dcdcdc4c',
              cursor: 'pointer',
            }}
            onClick={() => setIsCollapsed((_prev) => (_prev = !isCollapsed))}
          >
            <Flex
              w={'24px'}
              h={'24px'}
              justifyContent={'center'}
              alignItems={'center'}
            >
              <HamburgerIcon />
            </Flex>
          </Flex> */}
        </Box>

        {/* language button */}
        {/* <Flex
        flexDirection="row"
        alignItems="center"
        justifyContent="flex-end"
        > */}
        <Box
          width={'10%'}
          position="relative"
          onClick={() => router.push('/')}
          cursor={'pointer'}
        >
          {/* <Image
            // priority
            // lazyRoot={lazyRoot}
            // src={EBLogo}
            // width="100%"
            layout="responsive"
            // layout="fixed"
            alt="logo"
          /> */}
        </Box>
        {willBack && (
          <Flex
            alignItems={'center'}
            style={style}
            w={'24px'}
            h={'24px'}
            //   style={{ border: '0px', borderRadius: '200px' }}
            color={'white'}
            bgColor={developementMode ? 'red' : 'transparent'}
            cursor={'pointer'}
            onClick={() => {
              if (willBack) {
                // if (!(backURL == undefined)) {
                //   router.replace(backURL)
                // } else {
                //   router.back()
                // }

                router.back()
              }
              return false
            }}
          >
            {willBack && <ChevronLeft />}
          </Flex>
        )}

        <Text style={{ paddingLeft: '20px' }}>{titleL}</Text>
      </Flex>

      <Menu>
        <MenuButton>
          <Flex direction="row">
            <Flex
              height="40px"
              width="40px"
              flexDirection="row"
              alignItems="center"
              justifyContent="center"
              cursor="pointer"
              // onClick={onMenuClick}
            >
              <Icon path={mdiMenu} size={1} color="#000000" />
            </Flex>
            {/* {user && (
              <Avatar
                height="40px"
                width="40px"
                name={`${user.givenName} ${user.familyName}`}
              />
            )} */}
          </Flex>
        </MenuButton>

        <MenuList>
          {/* <MenuItem
            onClick={
              () => {
                // contextData.dispatch({
                  //   type: BusinessStateActions.update_SettingPage, returnData: {
                    //     setting: false,
                    //   }
                    // }),
                    router.push({ pathname: '/setting' });
                  }
                  // {
                    // setDisplaySideNav(false)
                    // router.push('/setting')
                    //
                  }
                  >
                  Setting{' '}
                </MenuItem> */}

          {/* <MenuItem
            onClick={() => {
              setIsSigningOut(true)

              const onDismiss = () => {
                logout()
                setIsSigningOut(false)
                router.replace('/session/new')
              }
              toast({
                title: 'Signing You Out',
                status: 'success',
                duration: 2000,
                isClosable: true,
                // onClose: onDismiss,
              })
              setTimeout(onDismiss, 2000)
            }}
          >
            Sign Out
            {isSigningOut && (
              <Spinner marginLeft="10px" width="20px" height="20px" />
            )}
          </MenuItem> */}
          <MenuItem>something</MenuItem>
        </MenuList>
      </Menu>
      {/* </Flex> */}
    </Flex>

    // <React.Fragment/>
    // </Box>
    // </Container >
  )
}

export default Landing_Navbar
