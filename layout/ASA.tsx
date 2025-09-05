import React, { useState } from 'react'
import styled from '@emotion/styled'
import { Flex, IconButton } from '@chakra-ui/react'

import RootBase from './RootBase'

import { useMediaQuery } from 'react-responsive'
import { useElementSize } from 'usehooks-ts'
import { HamburgerIcon } from '@chakra-ui/icons'
import { navbarHeight } from '../theme/constant'
// import ASASideBar from '../components/General-UI/ASASideBar'

const ASALayout = ({
  children,
  style,
  auth,
}: {
  children: React.ReactNode | null
  style?: React.CSSProperties
  auth?: boolean
  headerWontBack?: boolean
  backURL?: string
}) => {

  const isMobileDevice = useMediaQuery({ query: '(max-width: 900px)' })

  // useEffect(() => {
  //   checkIsAuth(isAuth)
  //   if (isAuth && localStorage.hasOwnProperty('userInfo')) {
  //     const userInfo = JSON.parse(localStorage.getItem('userInfo') || '')
  //     console.log(`BaseLayout | userInfo ${JSON.stringify(userInfo)}`)
  //     console.log(`BaseLayout | auth ${isAuth}`)
  //     //since the landing page is using the BaseLayout for rendering, we need to set that to conditional render the siderbar and also the NavaHeader
  //     setIsTokenExisted((_prev) => (_prev = true))
  //     console.log(`isTokenExisted ${isTokenExisted}`)

  //     setUsername((_prev) => (_prev = userInfo.userAccountName))
  //     setRole((_prev) => (_prev = userInfo.accessRole))
  //     console.log(`role ${role}`)

  //     authAppData.dispatch({
  //       type: AuthAppActions.UPDATE_ACCESSROLE,
  //       accessRole: userInfo.accessRole,
  //     })
  //     authAppData.dispatch({
  //       type: AuthAppActions.UPDATE_USERINFO,
  //       userAccountName: userInfo.userAccountName,
  //       userUUID: userInfo.userUUID,
  //       userOrgUUID: userInfo.userOrgUUID,
  //       userFullName: userInfo.userFullName,
  //     })

  //     if (!localStorage.hasOwnProperty('orgName')) {
  //       console.log('>>>> get org name')

  //       let postData = {
  //         filter: {
  //           orgID: userInfo.userOrgUUID,
  //         },
  //         projection: {
  //           _id: false,
  //           name: true,
  //         },
  //         options: {},
  //       }
  //       get_org_list(postData)
  //         .then((res: any) => {
  //           console.log(`get_org_detail ${JSON.stringify(res.data)}`)
  //           const orgDetail = res.data.data[0]
  //           const orgName = orgDetail.name.en
  //             ? orgDetail.name.en
  //             : orgDetail.name

  //           authAppData.dispatch({
  //             type: AuthAppActions.UPDATE_USERINFO,
  //             userOrgName: orgName,
  //           })

  //           localStorage.setItem('orgName', orgName)
  //         })
  //         .catch((e) => {
  //           console.error(e)
  //           toast({
  //             title: e.code,
  //             description: e.response?.data?.message ?? e.message,
  //             status: 'error',
  //             duration: 3000,
  //             isClosable: false,
  //           })
  //         })
  //     }

  //     setIsLoading(false)

  //     // }
  //   } else {
  //     setIsLoading(false)
  //   }

  //   /* Only for the first mount, DO NOT Delete line below, it will tell eslint to skip checking */
  //   // eslint-disable-next-line react-hooks/exhaustive-deps
  // }, [])

  console.log(auth)

  const [ContentContainerRef, _ContentContainerSize] = useElementSize()

  // useEffect(() => {
  //   // Check if token exists
  //   if (testingMode !== true) {
  //     const token = localStorage.getItem('token')
  //     if (!token) {
  //       router.push('/')
  //       toast({
  //         title: 'You Are Not Login!',
  //         description: 'Please Login First.',
  //         status: 'warning',
  //         duration: 1500,
  //         isClosable: true,
  //       })
  //     }
  //   }
  // }, [router, testingMode, toast])
  const [isSidebarOpen, setIsSidebarOpen] = useState(false)
  const toggleSidebar = () => {
    setIsSidebarOpen(!isSidebarOpen)
  }

  return (
    <RootBase>
      <StyledBase style={style}>

        <Flex
          direction={isMobileDevice ? 'column' : 'row'}
          w={'100%'}
          maxW={isMobileDevice ? '100vw' : '100%'}
          maxH={'100vh'}
          overflow={'scroll'}
          ref={ContentContainerRef}
          //hide if need scroll bar
          css={{ '&::-webkit-scrollbar': { display: 'none' } }}
        >
          {/* <ASASideBar
              isOpen={isSidebarOpen}
              onClose={toggleSidebar}
              handleToHomepage={handleToHomepage}
              handleLogout={handleLogout}
            /> */}
          <Flex
            direction={'column'}
            maxW={isMobileDevice ? '100vw' : '100%'}
            minW={isMobileDevice ? '100%' : `calc(100% - ${`0`}px)`}
            alignItems={'center'}
            justifyContent={'center'}
          >
            <Flex
              direction={'column'}
              w={'100%'}
              minH={`100%`}
              bgColor={'#ffffff'}
              justifyContent={'center'}
            >
              <Flex
                bgColor={'#2ae6d9'}
                alignItems="center"
                justifyContent="flex-start"
                height={`${navbarHeight}px`}
              >
                <IconButton
                  aria-label="Toggle sidebar"
                  variant="ghost"
                  colorScheme="teal"
                  icon={<HamburgerIcon />}
                  onClick={toggleSidebar}
                  mr={'20px'}
                />
                Hi!
              </Flex>

              <Flex
                justifyContent={'center'}
                flex={1}
                h={`calc(100% - ${navbarHeight}px)`}
                minW={isMobileDevice ? '100%' : `calc(100% - ${`0`}px)`}
                maxW={isMobileDevice ? '100%' : `calc(100% - ${`0`}px)`}
              >
                <React.Fragment>{children}</React.Fragment>
              </Flex>
            </Flex>
          </Flex>
        </Flex>

      </StyledBase>
    </RootBase>
  )
}

export default ASALayout

const StyledBase = styled(Flex)`
  /* height: 100vh; Fallback for browsers that do not support Custom Properties */
  /* height: calc(var(--vh, 1vh) * 100); */
  height: 100vh;
  width: 100vw;
  /* background: #7d85f58c; */
  /* overflow: auto; */
  /* position: relative; */
`
