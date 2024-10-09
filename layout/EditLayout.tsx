import React, { useContext, useState } from 'react'
import styled from '@emotion/styled'
import { Flex, IconButton, Switch, Text, Button } from '@chakra-ui/react'

import RootBase from './RootBase'
import { useMediaQuery } from 'react-responsive'
import { useElementSize } from 'usehooks-ts'
import { HamburgerIcon } from '@chakra-ui/icons'
import { navbarHeight } from '../theme/constant'
import {
  SettingsAppActions,
  SettingsAppContext,
} from '../context/settingsState'
import { KeyboardArrowDown, KeyboardArrowUp } from '@mui/icons-material'
// import ASASideBar from '../components/General-UI/ASASideBar'

const EditLayout = ({
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
  console.log({ auth })
  // const [isLoading, setIsLoading] = useState(false)
  const isMobileDevice = useMediaQuery({ query: '(max-width: 900px)' })

  const [ContentContainerRef, _ContentContainerSize] = useElementSize()

  const [isSidebarOpen, setIsSidebarOpen] = useState(false)
  const toggleSidebar = () => {
    setIsSidebarOpen(!isSidebarOpen)
  }

  const appSetting = useContext(SettingsAppContext)

  const handleSwitchChange = (event: any) => {
    // console.log('Switch toggled:', event.target.checked);
    setIsPortraitLayout((_prev) => (_prev = !_prev))
    event.preventDefault()

    appSetting.dispatch({
      type: SettingsAppActions.UPDATE_LAYOUTDIRECTION,
      isPortraitLayout: !isPortraitLayout,
    })
    // Perform any desired actions based on the checked state
  }

  const [isPortraitLayout, setIsPortraitLayout] = useState(false)

  const [hideForm, setHideForm] = useState(false)

  //   useEffect(() => {
  //     handleSwitchChange()
  //   }, [isPortraitLayout])

  return (
    <RootBase>
      <StyledBase style={style}>
        {
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
                  direction={'column'}
                  h={`calc(100% - ${navbarHeight}px)`}
                  gap={'20px'}
                  p={'20px'}
                  pb={'0px'}
                >
                  <Flex alignItems={'center'} justifyContent={'space-between'}>
                    <Flex gap={'20px'}>
                      <Text>Portrait Edit Layout</Text>
                      <Switch size="lg" onChange={handleSwitchChange} />
                    </Flex>
                    {isPortraitLayout && (
                      <Button
                        rightIcon={
                          hideForm ? <KeyboardArrowDown /> : <KeyboardArrowUp />
                        }
                        mr={'40px'}
                        onClick={() => {
                          setHideForm((_prev) => (_prev = !hideForm))
                          appSetting.dispatch({
                            type: SettingsAppActions.UPDATE_HIDEFORM,
                            hideForm: !hideForm,
                          })
                        }}
                      >
                        {`${hideForm ? 'Show' : 'Hide'} Form`}
                      </Button>
                    )}
                  </Flex>
                  <Flex
                    direction={isPortraitLayout ? 'column' : 'row'}
                    justifyContent={'center'}
                    flex={1}
                    gap={'20px'}
                    h={`calc(100% - ${navbarHeight}px)`}
                    minW={isMobileDevice ? '100%' : `calc(100% - ${`0`}px)`}
                    maxW={isMobileDevice ? '100%' : `calc(100% - ${`0`}px)`}
                  >
                    <React.Fragment>{children}</React.Fragment>
                  </Flex>
                </Flex>
              </Flex>
            </Flex>
          </Flex>
        }
      </StyledBase>
    </RootBase>
  )
}

export default EditLayout

const StyledBase = styled(Flex)`
  /* height: 100vh; Fallback for browsers that do not support Custom Properties */
  /* height: calc(var(--vh, 1vh) * 100); */
  height: 100vh;
  width: 100vw;
  /* background: #7d85f58c; */
  /* overflow: auto; */
  /* position: relative; */
`
