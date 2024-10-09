import { Flex, useToast, Text } from '@chakra-ui/react'
import { Dispatch, SetStateAction } from 'react'
import { QueryRouteList } from '../../types/route'

const LocationListContainer = ({
  setSelectedOptions,
  selectedOptions,
  data,
  // editMode,
  isGoing2Edit, // setIsGoing2Edit,
}: {
  setSelectedOptions: Dispatch<SetStateAction<QueryRouteList[]>>
  selectedOptions: QueryRouteList[]
  data: QueryRouteList[]
  // editMode: boolean
  isGoing2Edit: boolean
  // setIsGoing2Edit: React.Dispatch<React.SetStateAction<boolean>>
}) => {
  const toast = useToast()

  const handleClick = (obj: QueryRouteList) => {
    if (!isGoing2Edit) {
      toast({
        title: 'Panel is locked!',
        description: 'Please press "Start Planning" button to start.',
        status: 'warning',
        duration: 1500,
        isClosable: true,
      })
    } else {
      if (
        selectedOptions.length >= 1 &&
        selectedOptions[selectedOptions.length - 1].locationID ===
          obj.locationID
      ) {
        toast({
          title: 'Prevs one can not be matched with query one!',
          description: 'Two of them must be different.',
          status: 'warning',
          duration: 1500,
          isClosable: true,
        })
      } else {
        setSelectedOptions((prevOptions) => [...prevOptions, obj])
      }
    }
  }
  return (
    <Flex
      justify="center"
      alignItems="flex-start"
      direction={'column'}
      // bgColor={'#0bffc6'}
      wrap={'wrap'}
      flex={1}
    >
      <Flex style={{ height: '100%', overflowY: 'auto' }}>
        <Flex direction={'column'} wrap="wrap" gap={'20px'}>
          {data.map((object: QueryRouteList, index: number) => (
            <Flex
              key={index}
              _hover={{ cursor: 'pointer' }}
              _active={{ cursor: 'pointer', bgColor: '#31c8ff' }}
              bgColor={
                selectedOptions.some(
                  (item) => item.locationID === object.locationID,
                )
                  ? '#a7e8ff'
                  : 'white'
              }
              borderWidth="2px"
              borderRadius={'10px'}
              borderColor={'black'}
              px={'20px'}
              py={'10px'}
              width={'200px'}
              onClick={() => {
                handleClick({
                  locationID: object.locationID,
                  displayName: object.displayName,
                })
              }}
              justifyContent="center"
              alignItems="center"
            >
              <Text fontSize={'24px'}>{object.displayName}</Text>
            </Flex>
          ))}
        </Flex>
      </Flex>
    </Flex>
  )
}

export default LocationListContainer
