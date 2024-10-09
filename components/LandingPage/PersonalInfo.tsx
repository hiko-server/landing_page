import {
  Text,
  Flex,
  Avatar,
  Button,
  Box,
  Accordion,
  AccordionButton,
  AccordionIcon,
  AccordionItem,
  AccordionPanel,
  VStack,
} from '@chakra-ui/react'
import React from 'react'
import LinkedInBadge from '../linkedIn/linkedIn'

const PersonalInfo = () => {
  return (
    <Flex
      padding={['20px', '40px']}
      direction="column"
      justifyContent="center"
      alignItems="center"
      gap={['20px', '40px']}
    >
      <Flex
        justifyContent="center"
        alignItems="center"
        gap={['20px', '40px']}
        direction="column"
      >
        <Avatar
          size="2xl"
          name="Hiko"
          src="https://media.licdn.com/dms/image/v2/D5635AQGLlQgi9cXF8A/profile-framedphoto-shrink_200_200/profile-framedphoto-shrink_200_200/0/1726112864176?e=1729058400&v=beta&t=UFNILli4aBpFX89a20nP1p9T1L0wJyv3hpmmtMgpLAQ"
        />

        <Flex
          direction="column"
          gap={['5px', '10px']}
          justifyContent="center"
          alignItems="center"
        >
          <Text fontSize={['24px', '33px']} textAlign="center">
            <strong>Li Yanpei, Hiko</strong>
          </Text>
          <Text fontSize={['24px', '33px']} textAlign="center">
            <strong>李彦霈</strong>
          </Text>
          <Text fontSize={['14px', '15px']} textAlign="center">
            Contact Phone: 852 62040827
          </Text>
          <Text fontSize={['14px', '15px']} textAlign="center">
            Email: liyanpei2004@outlook.com
          </Text>
          <Text fontSize={['14px', '15px']} textAlign="center">
            Mandarin, English
          </Text>
        </Flex>

        <Box mt={4} w={['100%', '300px']}>
          <Button
            size="lg"
            w="100%"
            fontSize={['18px', '22px']}
            mb={4}
            onClick={() => window.open('https://cv.hiko.dev')}
          >
            My CV
          </Button>

          <Button
            size="lg"
            w="100%"
            fontSize={['18px', '22px']}
            mb={4}
            onClick={() => window.open('https://github.com/HikoPLi')}
          >
            GitHub
          </Button>

          <Button
            size="lg"
            w="100%"
            fontSize={['18px', '22px']}
            onClick={() => window.open('https://gitlab.com/HikoPLi')}
          >
            GitLab
          </Button>
        </Box>
      </Flex>
      <Accordion allowToggle width="100%" maxW="400px">
        <AccordionItem>
          <AccordionButton _expanded={{ bg: 'gray.100' }}>
            <Box flex="1" textAlign="left" fontWeight="bold">
              <Text fontSize="md" fontWeight="bold">
                Linkedin
              </Text>
            </Box>
            <AccordionIcon />
          </AccordionButton>

          <AccordionPanel pb={4}>
            <VStack spacing={2} align="stretch">
              <LinkedInBadge />
            </VStack>
          </AccordionPanel>
        </AccordionItem>
      </Accordion>
    </Flex>
  )
}

export default PersonalInfo
