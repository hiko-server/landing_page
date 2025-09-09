import React from 'react'
import { Flex, Heading } from '@chakra-ui/react'
import HeaderFooter from '../../layout/HeaderFooter'
import CustomHead from '../../components/General-UI/CustomHead'
import HomeEditor from '../../components/Admin/HomeEditor'

export default function AdminHomeEditor() {
  const [isMobile] = [false]
  return (
    <>
      <CustomHead title="Admin Home" />
      <HeaderFooter isMobile={isMobile}>
        <Flex direction="column" p={6} gap={6}>
          <Heading size="md">Homepage Editor</Heading>
          <HomeEditor />
        </Flex>
      </HeaderFooter>
    </>
  )
}
