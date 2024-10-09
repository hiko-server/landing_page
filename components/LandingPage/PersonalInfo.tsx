import { Text, Flex } from '@chakra-ui/react'
import React from 'react'

const PersonalInfo = () => {
  return (
    <Flex ml={8} direction={'column'} overflow={'auto'} h={'30vh'}>
      <Text fontSize="xl" fontWeight="bold" mb={2}>
        Hiko, Yan Pei Li
      </Text>
      <Text fontSize="md" color="gray.500">
        852 6204 0827
      </Text>
      <Text fontSize="md" color="gray.500">
        86 13650770735
      </Text>
      <Text fontSize="md" color="gray.500">
        liyanpei2004@outlook.com
      </Text>
      <Text fontSize="md" color="gray.500">
        Sha Tin, New Territories, Hong Kong
      </Text>
    </Flex>
  )
}

export default PersonalInfo
