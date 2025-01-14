import React from 'react'
import { useRouter } from 'next/router'
import {
  Text,
  Accordion,
  AccordionButton,
  AccordionIcon,
  AccordionItem,
  AccordionPanel,
  Flex,
  VStack,
  Button,
  Box,
  Heading,
} from '@chakra-ui/react'
import styled from 'styled-components'
import ImageScroller from '../imageScoller/imageScroller'

import LandingCVSections from './LandingCVSections'
import ContactCard from '../Contact/ConatactCard'

const StyledBox = styled(Box)`
  background: white;
  display: block;
  margin-bottom: 0.5cm;
  margin-top: 0.5cm;
  width: 100%;
  max-width: 21cm;
  /* Add any other styles you want for the A4 paper component */
`

const QuickAccessAccordionItem = ({
  children,
}: {
  children: React.ReactNode | null
}) => (
  <AccordionItem borderWidth="1px" borderColor="gray.200" mb={4}>
    <h2>
      <AccordionButton _expanded={{ bg: 'gray.100', transition: 'background-color 0.3s ease' }}>
        <Box flex="1" textAlign="center" fontWeight="bold" p={4}>
          <Heading as="h3" size="md" textTransform="uppercase" color="blue.700">
            Quick Access
          </Heading>
        </Box>
        <AccordionIcon />
      </AccordionButton>
    </h2>
    <AccordionPanel px={6} py={4} color="white" transition="color 0.3s ease">
      {children}
    </AccordionPanel>
  </AccordionItem>
)

const Content = () => {
  const router = useRouter()
  const isEditMode = router.asPath.includes('edit')

  return (
    <Flex
      direction="row"
      alignItems="center"
      justifyContent="center"
      p={['20px', '40px']}
      gap={['20px', '40px']}
    >
      <Flex
        direction="column"
        alignItems="center"
        justifyContent="center"
        p={['20px', '40px']}
        gap={['20px', '40px']}
      >
        <ImageScroller />
        <ContactCard />
      </Flex>
      <StyledBox
        id="A4Paper"
        size="A4"
        p={'20px'}
        bgColor={'white'}
        overflowY={isEditMode ? 'scroll' : 'hidden'}
        style={{
          breakInside: 'avoid',
          marginTop: isEditMode ? '400px' : '0px',
        }}
      >
        <Accordion
          allowToggle
          width="100%"
          maxW="1000px"
          mt={[8, 16]}
          boxShadow="lg"
          borderRadius="md"
        >
          <QuickAccessAccordionItem>
            <VStack
              spacing={4}
              align="stretch"
              alignItems="center"
              justifyContent="center"
            >
              <ButtonGroup />
            </VStack>
          </QuickAccessAccordionItem>
        </Accordion>
        <LandingCVSections />
      </StyledBox>
    </Flex>
  )
}



const ButtonGroup = () => (
  <Flex
    mt={8}
    w={['100%', '350px']}
    direction="column"
    alignItems="center"
    justifyContent="center"
  >
    <Button
      size="lg"
      w="70%"
      fontSize={'24px'}
      mb={3}
      onClick={() => window.open('https://asa.hiko-prime.com/')}
    >
      <Text color="blue.700">ASA</Text>
    </Button>
    <Button
      size="lg"
      w="70%"
      fontSize={'24px'}
      mb={6}
      onClick={() => window.open('https://hiko.dev/cv/edit')}
    >
      <Text color="blue.700">CV Generator Demo</Text>
    </Button>
  </Flex>
)


export default Content
