import { useContext, useEffect, useState } from 'react'
import styled from '@emotion/styled'
import { Flex, useToast } from '@chakra-ui/react'

// import Navbar from '../components/Navbar'
// import Sidebar from '../components/Sidebar'
import RootBase from './RootBase'

// import { AppContext } from '../context/state'
import Footer from '../components/General-UI/Footer'
// import { AppContext } from '../context/state'
import LoadingScreen from '../components/General-UI/LoadingScreen'
import { useRouter } from 'next/router'
// import { MarkAppContext } from '../context/markState'

import { isMobileOnly } from 'react-device-detect'

import { AuthToken } from '../services/auth_token'
import { AuthAppActions, AuthAppContext } from '../context/authState'
import Landing_Navbar from '../components/General-UI/Landing_Navbar'
// import { get_org_detail } from '../api/org'
// import CustomHead from '../components/CustomHead'

/* environment variable */
const developementMode =
  process.env.NEXT_PUBLIC_PRODUCTION_MODE === 'development'

const Landing_BaseLayout = ({
  children,
  style,
  auth,
  headerWontBack = false,
  backURL,
}: {
  children: React.ReactNode | null
  style?: React.CSSProperties
  auth?: boolean
  headerWontBack?: boolean
  backURL?: string
}) => {
  const router = useRouter()
  const toast = useToast()
  const authAppData = useContext(AuthAppContext)

  const [isLoading, setIsLoading] = useState(true)
  const [_role, setRole] = useState('')
  useEffect(() => {
    // checkIsAuth(auth)
    if (auth) {
      //since the landing page is using the BaseLayout for rendering, we need to set that to conditional render the siderbar and also the NavaHeader
      // setIsTokenExisted((prevIsTokenExisted) => prevIsTokenExisted == true)

      const token = localStorage.getItem('access_token') || ''
      let t = new AuthToken(token)
      setRole((_prevRole) => (_prevRole = t.authRole))
      authAppData.dispatch({
        type: AuthAppActions.UPDATE_ACCESSROLE,
        accessRole: t.authRole,
      })
      authAppData.dispatch({
        type: AuthAppActions.UPDATE_USERINFO,
        userAccountName: t.authUserUserName,
        userUUID: t.authUserUserUUID,
        userOrgUUID: t.authUserUserOrgUUID,
        userFullName: t.authUserFullName,
      })

      localStorage.setItem(
        'userInfo',
        JSON.stringify({
          userAccountName: t.authUserUserName,
          userUUID: t.authUserUserUUID,
          userOrgUUID: t.authUserUserOrgUUID,
          userFullName: t.authUserFullName,
        }),
      )
      if (isMobileOnly && !developementMode) {
        toast({
          title: 'Mobile View is not available',
          description:
            'Mobile View only available for Scan Function. Please use other device to process other functions.',
          status: 'warning',
          duration: 2000,
          isClosable: true,
          // onClose: onDismiss,
        })
        router.replace('/scan')
      } else {
        // if (authAppData.state.userUUID == '') {
        //   console.log('update userInfo for the context')
        //   console.log(t.authUserUserName)
        //   authAppData.dispatch({
        //     type: AuthAppActions.UPDATE_USERINFO,
        //     userAccountName: t.authUserUserName,
        //     userUUID: t.authUserUserUUID,
        //     userOrgUUID: t.authUserUserOrgUUID,
        //     userFullName: t.authUserFullName,
        //   })
        // }

        setIsLoading(false)
      }
      // }
    } else {
      setIsLoading(false)
    }
    /* Only for the first mount, DO NOT Delete line below, it will tell eslint to skip checking */
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <RootBase>
      <StyledBase style={style}>
        {/* <CustomHead /> */}
        {isLoading ? (
          <LoadingScreen />
        ) : (
          <>
            <Flex direction={'column'} w={'100%'}>
              <Landing_Navbar
                willBack={!headerWontBack}
                backURL={backURL}
                // auth={auth}
              />
              <Flex direction={'row'} flex={1}>
                {/* {isTokenExisted ||
                  (!router.asPath.includes('session') &&
                    !appData.state.sidebarCollapsed && <Sidebar />)} */}
                {/* <Sidebar /> */}

                <Flex
                  direction={'column'}
                  h={'calc(100vh - 56px)'}
                  w={'100%'}
                  flex={'1'}
                  bgColor="red"
                  alignItems={'center'}
                  justifyContent={'start'}
                  // overflowY={'hidden'}
                >
                  <Main h={'calc(100vh - 56px - 39.5px)'}>
                    <React.Fragment>{children}</React.Fragment>
                  </Main>
                  <Footer />
                </Flex>
              </Flex>
            </Flex>
          </>
        )}
      </StyledBase>
    </RootBase>
  )
}

export default Landing_BaseLayout

const StyledBase = styled(Flex)`
  /* height: 100vh; Fallback for browsers that do not support Custom Properties */
  /* height: calc(var(--vh, 1vh) * 100); */
  height: 100vh;
  width: 100vw;
  background: white;
  /* overflow: auto; */
  /* position: relative; */
`

const Main = styled(Flex)`
  flex: 1;
  /* background: white; */
  background: #f5f5f7;
  flex-direction: column;
  padding: 20px;
  align-items: center;
  justify-content: start;
  width: 100%;
  /* height: 100vh; */
  overflow: auto;
  /* justify-content: space-between; */
`
