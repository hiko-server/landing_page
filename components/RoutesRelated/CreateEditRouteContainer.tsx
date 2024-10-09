import { Flex, Input, useToast, Button, Text, Box } from '@chakra-ui/react'
import { Dispatch, SetStateAction, useEffect, useState } from 'react'
import { QueryRouteList, RouteDetail } from '../../types/route'
import React from 'react'
import CustomInput from '../CustomInput'
// import { faSearch } from '@fortawesome/free-solid-svg-icons'
import {
  Delete,
  KeyboardDoubleArrowDown,
  North,
  South,
} from '@mui/icons-material'

const dataField = [
  {
    fieldName: 'Name',
    fieldKey: 'name',
    type: 'name',
  },
  {
    fieldName: 'Description',
    fieldKey: 'description',
    type: 'description',
  },
]
const CreateEditRouteContainer = ({
  editMode,
  isGoing2Edit,
  setIsGoing2Edit,
  selectedOptions,
  setSelectedOptions,
  routeDetail,
  isDemo,
}: {
  editMode: boolean
  isGoing2Edit: boolean
  setIsGoing2Edit: React.Dispatch<React.SetStateAction<boolean>>
  selectedOptions: QueryRouteList[]
  setSelectedOptions: Dispatch<SetStateAction<QueryRouteList[]>>
  routeDetail: RouteDetail
  isDemo?: boolean
}) => {
  const toast = useToast()
  const [renderResetButton, setRenderResetButton] = useState(false)
  const [isReset, setIsReset] = useState(false)
  const [formData, setFormData] = useState<RouteDetail>(routeDetail)
  const [isGoing2Update, setIsGoing2Update] = useState<boolean>(false)

  console.log(isGoing2Update)

  const reset_FormData = () => {
    console.log('isResetFormData is triggered')
    setFormData((_prev) => {
      return {
        ..._prev,
        ...routeDetail,
      }
    })
    setSelectedOptions((_prev) => (_prev = routeDetail.routeOrder))
  }

  useEffect(() => {
    if (isReset) {
      reset_FormData()
      console.log('\n\nformdata is updated', JSON.stringify(formData))
      setRenderResetButton((_prev) => (_prev = false))
      setIsReset((_prev) => (_prev = false))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isReset])

  // useEffect(() => {
  //     if (isGoing2Update) {
  //         // setIsLoadingScreen((_prev) => (_prev = true))

  //         if (editMode) {
  //             let payload = {
  //                 routeID: router.query.RouteID,
  //                 name: formData.name,
  //                 description: formData.description,
  //                 routeOrder: selectedOptions.map((item) => item.locationID),
  //             }

  //             update_route(payload)
  //                 .then((res) => {
  //                     if (res.data.success) {
  //                         toast({
  //                             title: 'Update Success!',
  //                             description:
  //                                 'Route detail is updated!\nThe system will return to previous page after 3 seconds',
  //                             status: 'success',
  //                             duration: 1500,
  //                             isClosable: true,
  //                         })
  //                     }
  //                 })
  //                 .catch((e) => {
  //                     console.log(e)
  //                     toast({
  //                         title: 'Update Error!',
  //                         description: e,
  //                         status: 'success',
  //                         duration: 1500,
  //                         isClosable: true,
  //                     })
  //                 })
  //                 .finally(() => {
  //                     setIsGoing2Update(false)
  //                     setIsGoing2Edit(false)

  //                     setTimeout(() => {
  //                         router.back()
  //                     }, 2500)
  //                 })
  //         } else {
  //             let payload = {
  //                 routeID: router.query.RouteID,
  //                 name: formData.name,
  //                 description: formData.description,
  //                 routeOrder: selectedOptions.map((item) => item.locationID),
  //             }
  //             let routeID: string
  //             create_route(payload)
  //                 .then((res: any) => {
  //                     if (res.data.success) {
  //                         toast({
  //                             title: 'Create Success!',
  //                             description:
  //                                 'Route detail is updated!\nThe system will return to the new created route detail page after 3 seconds',
  //                             status: 'success',
  //                             duration: 1500,
  //                             isClosable: true,
  //                         })

  //                         routeID = res.data.data.routeID

  //                         setTimeout(() => {
  //                             router.replace(`/cruising-panel/${routeID}`)
  //                         }, 2500)
  //                     }
  //                 })
  //                 .catch((e) => {
  //                     console.log(e)
  //                     toast({
  //                         title: 'Create Error!',
  //                         description: e,
  //                         status: 'success',
  //                         duration: 1500,
  //                         isClosable: true,
  //                     })
  //                     setTimeout(() => {
  //                         router.back()
  //                     }, 2500)
  //                 })
  //                 .finally(() => {
  //                     setIsGoing2Update(false)
  //                     setIsGoing2Edit(false)
  //                 })
  //         }
  //     }

  //     // eslint-disable-next-line react-hooks/exhaustive-deps
  // }, [isGoing2Update])

  useEffect(() => {
    console.log('formData', formData)
    console.log('routeDetail', routeDetail)
    console.log(
      'formData==routeDetail',
      JSON.stringify(formData) == JSON.stringify(routeDetail),
    )
    if (selectedOptions !== routeDetail.routeOrder) {
      setRenderResetButton(true)
    }

    if (JSON.stringify(formData) !== JSON.stringify(routeDetail)) {
      setRenderResetButton(true)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedOptions, formData])

  const handleSaveCreate = () => {
    if (selectedOptions.length >= 1) {
      if (formData.name === '' || formData.description === undefined) {
        toast({
          title: 'Route Name Is Empty!',
          description: 'Please Enter Route Name!',
          status: 'warning',
          duration: 1500,
          isClosable: true,
        })
      } else {
        setIsGoing2Update(true)
      }
    } else {
      console.log('No routes!')
      toast({
        title: 'Filed!',
        description: 'Please add routes!',
        status: 'warning',
        duration: 1500,
        isClosable: true,
      })
    }
    if (isDemo) {
      console.log('Demo mode! Can not save to database')
      toast({
        title: 'Filed!',
        description: 'Can not save to database in Demo mode',
        status: 'warning',
        duration: 1500,
        isClosable: true,
      })
    }
  }

  const handlePositionUP = (index: number) => {
    if (index > 0) {
      setSelectedOptions((prevOptions) => {
        const updatedOptions = [...prevOptions]
        const temp = updatedOptions[index]
        updatedOptions[index] = updatedOptions[index - 1]
        updatedOptions[index - 1] = temp
        return updatedOptions
      })
      toast({
        title: 'Success!',
        description: 'Position UP!',
        status: 'success',
        duration: 1500,
        isClosable: true,
      })
    }
  }

  const handlePositionDOWN = (index: number) => {
    if (index < selectedOptions.length - 1) {
      setSelectedOptions((prevOptions) => {
        const updatedOptions = [...prevOptions]
        const temp = updatedOptions[index]
        updatedOptions[index] = updatedOptions[index + 1]
        updatedOptions[index + 1] = temp
        return updatedOptions
      })
      toast({
        title: 'Success!',
        description: 'Position Down!',
        status: 'success',
        duration: 1500,
        isClosable: true,
      })
    }
  }

  const handlePositionDELETE = (index: number) => {
    setSelectedOptions((prevOptions) => {
      const deleteOptions = [...prevOptions]
      deleteOptions.splice(index, 1)
      setSelectedOptions(deleteOptions)
      return deleteOptions
    })
    toast({
      title: 'Success!',
      description: 'Position Delete!',
      status: 'success',
      duration: 1500,
      isClosable: true,
    })
  }

  return (
    <React.Fragment>
      <Flex
        direction={'column'}
        // bgColor={'#ff7c7c'}
        flex={1}
        justifyContent="center"
        alignItems="center"
        w={'100%'}
        padding={'20px'}
      >
        {
          <Flex
            justify="center"
            alignItems="center"
            direction={'column'}
            w={'100%'}
            pb={'40px'}
          >
            {!isReset && (
              <Flex
                flexWrap="wrap"
                style={{ visibility: isReset ? 'hidden' : 'visible' }}
                gap={'20px'}
              >
                {dataField.map((i: any, k: any) => {
                  return (
                    <React.Fragment key={k}>
                      <CustomInput name={i.fieldName}>
                        <Input
                          key={k}
                          defaultValue={
                            {
                              description: routeDetail.name,
                              name: routeDetail.name,
                            }[i.fieldKey as unknown as string] ||
                            routeDetail[`${i.fieldKey as string}`]
                          }
                          width={'100%'}
                          type={'text'}
                          disabled={!isGoing2Edit}
                          // variant="flushed"
                          variant="outline"
                          fontSize="18px"
                          isRequired
                          borderColor={'#a0a0a0'}
                          onChange={(e) => {
                            setFormData((_prev) => {
                              const formData: RouteDetail = {
                                ..._prev,
                              }
                              switch (i.fieldKey) {
                                case 'name':
                                  name: formData.name = e.target.value
                                  break
                                case 'description':
                                  description: formData.description =
                                    e.target.value
                                  break

                                default: {
                                  formData[`${i.fieldKey as string}`] =
                                    e.target.value
                                  break
                                }
                              }
                              return formData
                            })
                          }}
                        />
                      </CustomInput>
                    </React.Fragment>
                  )
                })}
              </Flex>
            )}
          </Flex>
        }
        {!isReset && (
          <Flex
            css={{
              '&::-webkit-scrollbar': {
                display: 'block',
                width: '5px',
                backgroundColor: '#F5F5F5',
                paddingLeft: '10px', // set the padding-left property
              },
              '&::-webkit-scrollbar-thumb': {
                backgroundColor: '#b5b5b5',
              },
            }}
            overflowY="auto"
            flex={1}
            direction="column"
            alignItems="center"
            gap={'10px'}
            pr={'50px'}
            ml={'50px'}
          >
            {selectedOptions.map((option, index) => (
              <React.Fragment key={index}>
                <Flex
                  key={index}
                  alignItems="center"
                  justifyContent={isGoing2Edit ? 'space-between' : 'center'}
                  bgColor={'#ffffff'}
                  // gap={'10px'}
                  borderRadius={'10px'}
                  borderWidth={'2px'}
                  borderColor={'black'}
                  px={'20px'}
                  py={'5px'}
                  w={'300px'}
                >
                  {/* {index > 0 && <span>&#8594;</span>} */}
                  {isGoing2Edit && (
                    <Flex w={'50px'}>
                      {isGoing2Edit && index > 0 && (
                        <Box
                          borderRadius={'10px'}
                          padding={'5px'}
                          _hover={{ cursor: 'pointer', color: 'blue' }}
                          _active={{
                            cursor: 'pointer',
                            color: 'blue',
                            bgColor: '#afd7ff',
                          }}
                        >
                          <North onClick={() => handlePositionUP(index)} />
                        </Box>
                      )}
                      {isGoing2Edit && index < selectedOptions.length - 1 && (
                        <Box
                          borderRadius={'10px'}
                          padding={'5px'}
                          _hover={{ cursor: 'pointer', color: 'green' }}
                          _active={{
                            cursor: 'pointer',
                            color: 'green',
                            bgColor: '#bcfff6',
                          }}
                        >
                          <South
                            // style={{
                            //   cursor: 'pointer',
                            // }}
                            onClick={() => handlePositionDOWN(index)}
                          />
                        </Box>
                      )}
                    </Flex>
                  )}
                  <Flex alignItems={'center'} justifyContent={'center'}>
                    <Text fontSize={'24px'} textAlign={'center'}>
                      {option.displayName}
                    </Text>
                  </Flex>
                  {isGoing2Edit && (
                    <Flex
                      justifyContent={'center'}
                      alignItems={'center'}
                      bgColor={'red'}
                      color={'white'}
                      _hover={{
                        cursor: 'pointer',
                        // color: 'red',
                        bgColor: '#c60303',
                      }}
                      _active={{
                        cursor: 'pointer',
                        color: 'red',
                        bgColor: '#ffc7c7',
                      }}
                      w={'24px'}
                      h={'24px'}
                      borderRadius={'50%'}
                      p={'16px'}
                    >
                      <Delete onClick={() => handlePositionDELETE(index)} />
                    </Flex>
                  )}
                </Flex>
                {index + 1 < selectedOptions.length && (
                  // <Flex
                  //   // bgColor={'#ab80ff'}
                  //   justifyContent={'center'}
                  //   alignItems={'center'}
                  //   // py={'10px'}
                  // >
                  <KeyboardDoubleArrowDown />
                  // </Flex>
                )}
              </React.Fragment>
            ))}
          </Flex>
        )}
        <Flex
          py={'20px'}
          gap={'20px'}
          direction={'row'}
          justifyContent={'flex-end'}
        >
          <Button
            onClick={(e) => {
              e.preventDefault()
              setIsGoing2Edit((_prev) => (_prev = !_prev))
            }}
            // paddingX={'40px'}
            height={'40px'}
          >
            {isGoing2Edit ? 'Cancel' : editMode ? 'Edit' : 'Start Planing'}
          </Button>
          {isGoing2Edit && renderResetButton && (
            <Button
              onClick={(e) => {
                e.preventDefault()
                console.log('isReset button is fired')
                setIsReset(true)
              }}
              height={'40px'}
            >
              Reset
            </Button>
          )}
          {isGoing2Edit && selectedOptions.length > 0 && (
            <Button
              onClick={(e) => {
                e.preventDefault()
                // console.log('isReset button is fired')
                setSelectedOptions((_prev) => (_prev = []))
              }}
              height={'40px'}
            >
              Clear Route Items
            </Button>
          )}
          {isGoing2Edit && renderResetButton && selectedOptions.length > 0 && (
            <Button
              variant="solid"
              colorScheme="blue"
              onClick={(e) => {
                e.preventDefault()
                handleSaveCreate()
                // setUpdatePayload((_prev) => formData)
                // setIsGoing2Update(true)

                console.log(`save`)
              }}
              height={'40px'}
              isDisabled={!isGoing2Edit}
            >
              {editMode ? 'Save' : 'Create'}
            </Button>
          )}
        </Flex>
      </Flex>
    </React.Fragment>
  )
}
export default CreateEditRouteContainer
