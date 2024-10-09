import { Text, Flex } from '@chakra-ui/react'
import React from 'react'

const PersonalInfo = () => {
  return (
    <Flex ml={8} direction={'column'} overflow={'auto'} h={'30vh'}>
      <Text fontSize="xl" fontWeight="bold" mb={2}>
        Hiko, Yan Pei Li
      </Text>
      <Text fontSize="md" color="gray.500">
        +852 0000 0000
      </Text>
      <Text fontSize="md" color="gray.500">
        +852 0000 0000
      </Text>
      <Text fontSize="md" color="gray.500">
        owner@example.test
      </Text>
      <Text fontSize="md" color="gray.500">
        Example Road, Hong Kong
      </Text>
    </Flex>
  )
}

export default PersonalInfo
