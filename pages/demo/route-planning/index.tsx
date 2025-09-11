import React, { useState, useEffect } from 'react'
// import { delete_route, get_route_detail } from '../../../api/route'
import { useRouter } from 'next/router'
import { Flex, Text, Button, useDisclosure } from '@chakra-ui/react'
import ASALayout from '../../../layout/ASA'

import {
    KeyboardDoubleArrowDown,
    KeyboardDoubleArrowUp,
    KeyboardDoubleArrowRight,
    // KeyboardDoubleArrowLeft,
    // DoubleArrow,
} from '@mui/icons-material'
// import { cl } from '../../../helpers/consoleLog'

// import { AuthAppContext } from '../../../context/authState'
// import { ASAIdentity } from '../../../types/accountProps'
import ConfirmDeleteDialog from '../../../components/ConfirmDeleteDialog'
import Panel from '../../../components/Panels/Panel'
import { GetServerSideProps } from 'next'

const RoutePath = ({ data }: { data: any }) => {
    const itemsPerGroup = 5
    const numGroups = Math.ceil(data[0].routeOrder.length / itemsPerGroup)
    // console.log('numGroups', numGroups)
    return (
        <Flex width={'100%'}>
            <Flex
                justifyContent="center"
                alignItems="center"
                gap={'10px'}
                wrap="wrap"
            >
                {data.length > 0 && (
                    <Flex direction="row" gap={'20px'}>
                        {Array.from({ length: numGroups }, (_, groupIndex) => (
                            <Flex direction={'row'} key={groupIndex} gap={'40px'}>
                                <Flex
                                    key={groupIndex}
                                    direction={groupIndex % 2 === 0 ? 'column' : 'column-reverse'}
                                // gap={'20px'}
                                >
                                    {data[0].routeOrder
                                        .slice(
                                            groupIndex * itemsPerGroup,
                                            (groupIndex + 1) * itemsPerGroup,
                                        )
                                        .map((item: any, itemIndex: number) => (
                                            <Flex
                                                key={itemIndex}
                                                direction={'column'}
                                            // bgColor={'red'}
                                            >
                                                <Flex
                                                    borderRadius={'10px'}
                                                    borderWidth={'1px'}
                                                    borderColor={'black'}
                                                    justifyContent={'center'}
                                                    alignItems={'center'}
                                                    px={'60px'}
                                                    py={'10px'}
                                                >
                                                    <Text fontSize={'24px'}>{item.displayName}</Text>
                                                </Flex>
                                                {/* <Text >{itemIndex}</Text> */}
                                                {groupIndex % 2 === 0 &&
                                                    itemIndex + 1 <
                                                    data[0].routeOrder.slice(
                                                        groupIndex * itemsPerGroup,
                                                        (groupIndex + 1) * itemsPerGroup,
                                                    ).length && (
                                                        <Flex
                                                            // bgColor={'#ab80ff'}
                                                            justifyContent={'center'}
                                                            alignItems={'center'}
                                                            py={'10px'}
                                                        >
                                                            <KeyboardDoubleArrowDown />
                                                        </Flex>
                                                    )}

                                                {groupIndex % 2 !== 0 && itemIndex > 0 && (
                                                    <Flex
                                                        // bgColor={'#ff6d5a'}
                                                        justifyContent={'center'}
                                                        alignItems={'center'}
                                                        py={'10px'}
                                                    >
                                                        <KeyboardDoubleArrowUp />
                                                    </Flex>
                                                )}
                                            </Flex>
                                        ))}
                                </Flex>
                                <Flex
                                    alignItems={groupIndex % 2 === 0 ? 'flex-end' : 'flex-start'}
                                    // bgColor={'#4eff86'}
                                    pb={groupIndex % 2 === 0 ? '20px' : '0px'}
                                    pt={groupIndex % 2 === 0 ? '0px' : '20px'}
                                    mr={'20px'}
                                >
                                    {groupIndex + 1 < numGroups && <KeyboardDoubleArrowRight />}
                                </Flex>
                            </Flex>
                        ))}
                    </Flex>
                )}
            </Flex>
        </Flex>
    )
}

const RouteDetailPage = (props: any) => {
    interface LocationDetail {
        locationID: string
        name: string
        displayName?: string
    }

    interface RouteDetail {
        routeID: string
        name: string
        description?: string
        routeOrder: string[] | LocationDetail[]
    }
    const [fetchNewData, setFetchNewData] = useState<boolean>(false)
    const [data, setData] = useState<RouteDetail[] | null>(null)
    const router = useRouter()


    const [isGoing2Delete, setIsGoing2Delete] = useState(false)
    console.log(fetchNewData, isGoing2Delete)

    // const payload = {
    //     filter: {
    //         routeID: [router.query.RouteID],
    //     },
    //     projection: {
    //         name: true,
    //         description: true,
    //         routeID: true,
    //         routeOrder: true,
    //         displayLocationName: true,
    //     },
    //     options: {},
    // }

    // useEffect(() => {
    //     if (fetchNewData) {
    //         get_route_detail(payload)
    //             .then((res: any) => {
    //                 cl(`get_route_detail`, res.data.data)

    //                 setData((_prev) => res.data.data)
    //             })
    //             .then(() => {
    //                 setFetchNewData(false)
    //             })
    //             .catch((e) => {
    //                 console.error(e)
    //             })
    //     }
    //     // eslint-disable-next-line react-hooks/exhaustive-deps
    // }, [fetchNewData])

    useEffect(() => {
        // console.log({ props })
        setData(props.data)
        setFetchNewData(true)
    }, [])

    //View route detail (user + admin can view)

    // const authAppData = useContext(AuthAppContext)

    // const toast = useToast()

    const { isOpen, onOpen, onClose } = useDisclosure()
    const [displayConfirmDeleteDialog, setDisplayConfirmDeleteDialog] =
        useState(false)

    useEffect(() => {
        if (displayConfirmDeleteDialog) {
            console.log('isOpen', isOpen)
            console.log('will trigger delete dialog')

            onOpen()

            // setDisplayConfirmDeleteDialog(false)
        }
        /* Only for the first mount, DO NOT Delete line below, it will tell eslint to skip checking */
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [displayConfirmDeleteDialog])

    // useEffect(() => {
    //     if (isGoing2Delete && data !== null) {
    //         let payLoad = {
    //             routeID: data[0].routeID,
    //         }
    //         delete_route(payLoad)
    //             .then((res: any) => {
    //                 if (res.success) {
    //                     toast({
    //                         title: 'Delete successfully',
    //                         description: 'Delete location successfully',
    //                         status: 'success',
    //                         duration: 3000,
    //                         isClosable: false,
    //                     })
    //                 }
    //             })
    //             .then(() => {
    //                 setIsGoing2Delete(false)
    //                 setDisplayConfirmDeleteDialog(false)
    //                 onClose()
    //             })
    //             .then(() => {
    //                 setFetchNewData(true)
    //                 router.back()
    //             })
    //             .catch((e) => {
    //                 toast({
    //                     title: e.code as string,
    //                     description: e.response?.data?.message ?? (e.message as string),
    //                     status: 'error',
    //                     duration: 3000,
    //                     isClosable: false,
    //                 })
    //             })
    //     }
    //     onClose()
    //     setDisplayConfirmDeleteDialog(false)
    //     // eslint-disable-next-line react-hooks/exhaustive-deps
    // }, [isGoing2Delete])

    return (
        <React.Fragment>
            <ASALayout>
                <Panel name={'Cruising'} willBack>
                    <Flex direction={'column'} gap={'20px'}>
                        {(!data || data.length === 0) && (
                          <Flex direction={'column'} gap={'10px'}>
                            <Text fontSize={'18px'} color={'gray.600'}>No route loaded.</Text>
                            <Text fontSize={'16px'} color={'gray.500'}>
                              Provide real stops via the editor or link with your API to visualize an actual route.
                            </Text>
                          </Flex>
                        )}
                        {data !== null && data.length > 0 && (
                            <Flex direction={'column'} fontSize={'20px'}>
                                <Flex gap={'20px'}>
                                    <Text fontWeight={600}>{`Route Name:`}</Text>
                                    <Text>
                                        {`${data !== null && data.length > 0 ? (data[0]!.name as string) : 'Loading'
                                            }`}
                                    </Text>
                                </Flex>
                                <Flex gap={'20px'}>
                                    <Text fontWeight={600}>{`Route Description:`}</Text>
                                    <Text>
                                        {`${data !== null && data.length > 0
                                            ? (data[0]!.description as string)
                                            : 'Loading'
                                            }`}
                                    </Text>
                                </Flex>
                            </Flex>
                        )}
                        {data !== null && data.length > 0 && <RoutePath data={data} />}

                        <Flex
                            position="fixed"
                            bottom={'60px'}
                            left={0}
                            width="100%"
                            justifyContent="center"
                            padding={4}
                        >
                            {/* <Flex
                borderRadius="full"
                bg={`#00b7ff`}
                color="red"
                _hover={{ bg: 'gray.400', cursor: 'pointer' }}
                _active={{ bg: 'gray.500' }}
                onClick={() => {
                  router.back()
                }}
                justifyContent="center"
                alignItems="center"
                width="10%"
                padding={2}
              >
                Back
              </Flex> */}
                            {
                                data !== null && (
                                    <Flex gap={'20px'}>
                                        <Button
                                            onClick={() => {
                                                router.push(
                                                    `${router.pathname}/${data[0].routeID}/edit`,
                                                )
                                            }}
                                        >
                                            Edit Route
                                        </Button>
                                        <Button
                                            colorScheme="red"
                                            onClick={() => {
                                                console.log('setDisplayConfirmDeleteDialog true')
                                                setDisplayConfirmDeleteDialog?.(true)
                                            }}
                                        >
                                            Delete
                                        </Button>
                                        <ConfirmDeleteDialog
                                            onClose={onClose}
                                            isOpen={isOpen}
                                            type={'Route'}
                                            name={data[0].name}
                                            uuid={data[0].routeID}
                                            setIsGoing2Delete={setIsGoing2Delete}
                                        />
                                    </Flex>
                                )}
                        </Flex>
                    </Flex>
                </Panel>
            </ASALayout>
        </React.Fragment>
    )
}

export default RouteDetailPage

export const getServerSideProps: GetServerSideProps = async () => {
  if (process.env.ENABLE_DEMO !== 'true') {
    return { notFound: true }
  }
  // No static demo payload; present empty UI for real input.
  return { props: { success: true, data: [], auth: true } }
}
