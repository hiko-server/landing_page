import { Flex, Text } from '@chakra-ui/react'
import ContentBox from '../../layout/ContentBox'
import { useElementSize } from 'usehooks-ts'
import { navbarHeight } from '../../theme/constant'
import { useRouter } from 'next/router'
import { ChevronLeft } from '@mui/icons-material'
import React from 'react'
// import { useElementSize } from 'usehooks-ts'

const Panel = ({
    name,
    children,
    style,
    isOverflow = true,
    willBack = true,
    disablePanelClick,
}: {
    name?: string
    displaySaveButton?: boolean
    saveButtonName?: string
    children?: React.ReactNode | null
    style?: React.CSSProperties
    isOverflow?: boolean
    willBack?: boolean
    containerHeight?: number
    disablePanelClick?: boolean
}) => {
    // const [contentContainerRef, contentContainerRefValue] = useElementSize()
    const [nameContainerRef, nameContainerRefValue] = useElementSize()
    // const [buttonContainerRef, buttonContainerRefValue] = useElementSize()
    // console.log(
    //   `calc(100vh - ${navbarHeight}px - 40px - 40px - ${
    //     nameContainerRefValue.height
    //   }px - ${navbarHeight * 4}px)`,
    // )
    const router = useRouter()
    return (
        <ContentBox style={style}>
            <Flex
                // opacity={isRendered ? 1 : 0}
                // transform={isRendered ? 'translateY(0)' : 'translateY(20px)'}
                // transition="opacity 0.7s, transform 0.9s"
                flexDirection={'column'}
                flex={1}
                width={'100%'}
                justifyContent={'center'}
                alignItems={'center'}
                // bgColor={devMode ? '#a4fabb' : 'transparent'}
                gap={'20px'}

            // ref={contentContainerRef}
            >
                <Flex
                    direction={'row'}
                    ref={nameContainerRef}
                    maxH={`${navbarHeight}px`}
                    alignItems={'center'}
                    justifyContent={
                        router.pathname != '/dashboard' ? 'space-between' : 'center'
                    }
                    gap={'20px'}
                    width={'100%'}
                // bgColor={'red'}
                >
                    {router.pathname != '/dashboard' && (
                        <Flex
                            // gap={'10px'}
                            // bgColor={'yellow'}
                            flex={1}
                            _hover={{ cursor: 'pointer', fontWeight: 600 }}
                            onClick={() => {
                                if (willBack) {
                                    // if (!(backURL == undefined)) {
                                    //   router.replace(backURL)
                                    // } else {
                                    //   router.back()
                                    // }

                                    // router.back()


                                    router.back()

                                }
                            }}
                        >
                            <Flex
                                _hover={{ cursor: 'pointer', w: '26px', h: '26px' }}
                                justifyContent={'center'}
                                alignItems={'center'}
                                style={style}
                                w={'24px'}
                                h={'24px'}
                                //   style={{ border: '0px', borderRadius: '200px' }}
                                color={'black'}
                                // bgColor={devMode ? 'red' : 'transparent'}
                                cursor={'pointer'}
                            >
                                {willBack && <ChevronLeft />}
                            </Flex>
                            <Text>Back</Text>
                        </Flex>
                    )}
                    {name ? (
                        <Flex
                            //   flex={1}
                            // bg={devMode ? '#a6ff00' : 'transparent'}
                            justifyContent={'center'}
                            alignItems={'center'}
                            borderRadius={'20px'}
                            borderWidth={'2px'}
                            borderColor={'black'}
                            px={'20px'}
                            py={'10px'}
                            _hover={{
                                cursor:
                                    router.pathname == `/${name.toLowerCase()}-panel` ||
                                        disablePanelClick
                                        ? 'default'
                                        : 'pointer',
                                bgColor:
                                    router.pathname == `/${name.toLowerCase()}-panel` ||
                                        disablePanelClick
                                        ? 'transparent'
                                        : '#dfdfdf',
                                userSelect: 'none',
                            }}
                            _active={{
                                bgColor:
                                    router.pathname == `/${name.toLowerCase()}-panel` ||
                                        disablePanelClick
                                        ? 'transparent'
                                        : '#f0f0f0',
                            }}
                        // _disabled={router.pathname == `/${name.toLowerCase()}-panel`}
                        // onClick={() => {
                        //     const targetLink = `/${name.toLowerCase()}-panel`
                        //     if (router.pathname != targetLink && !disablePanelClick) {
                        //         router.push(targetLink)
                        //     }

                        //     // console.log(router.pathname)
                        //     // console.log(`/${name.toLowerCase()}-panel`)
                        // }}
                        >
                            <Text fontSize="20px">{`${name} Panel`}</Text>
                        </Flex>
                    ) : (
                        <Flex></Flex>
                    )}
                    {router.pathname != '/dashboard' ? (
                        <Flex flex={1} bgColor={'yellow'} />
                    ) : (
                        <></>
                    )}
                </Flex>

                <Flex
                    flex={5}
                    // backgroundColor={devMode ? '#e3e3e3' : 'transparent'}
                    width={'100%'}
                    justifyContent={'center'}
                    maxH={`calc(100vh - ${navbarHeight}px - 40px - 40px - 60px - ${nameContainerRefValue.height
                        }px - ${navbarHeight * 0}px)`}
                    overflowY={isOverflow ? 'scroll' : undefined}
                    css={{ '&::-webkit-scrollbar': { display: 'none' } }}
                >
                    {children}
                </Flex>
                {/* <Flex
          //   flex={1}
          bg={devMode ? '#a6ff00' : 'transparent'}
          justifyContent={'center'}
          alignItems={'center'}
          // borderRadius={'20px'}
          // borderWidth={'2px'}
          // padding={'20px'}
          ref={buttonContainerRef}
        >
          {displaySaveButton && (
            <Button>{saveButtonName ? saveButtonName : `Save`}</Button>
          )}
        </Flex> */}
            </Flex>
        </ContentBox>
    )
}

export default Panel
