import {
  Text,
  Flex,
  Avatar,
  Button,
  Accordion,
  AccordionButton,
  AccordionIcon,
  AccordionItem,
  AccordionPanel,
  VStack,
} from '@chakra-ui/react'
import React from 'react'
import LinkedInBadge from '../linkedIn/linkedIn'

const PersonalInfo = ({ isMobile }: { isMobile: boolean }) => {
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
          src="../../public/images/personalImage.jpg"
          transition="transform 0.3s ease"
          _hover={{ transform: 'scale(1.05)' }}
        />

        <Flex
          direction="column"
          gap={['10px', '20px']}
          justifyContent="center"
          alignItems="center"
          textAlign="center"
          backgroundColor={'#ffffff'}
          padding={'20px'}
          borderRadius={'8px'}
          boxShadow={'0 4px 8px rgba(0, 0, 0, 0.1)'}
        >
          <Text
            fontSize={['30px', '40px']}
            fontWeight="bold"
            textAlign="center"
            color={'#333'}
          >
            Li Yanpei, Hiko
          </Text>
          <Text
            fontSize={['30px', '40px']}
            fontWeight="bold"
            textAlign="center"
            color={'#333'}
          >
            李彦霈
          </Text>
          <Text fontSize={['16px', '18px']} textAlign="center" color={'#333'}>
            Contact Phone: 852 62040827
          </Text>
          <Text fontSize={['16px', '18px']} textAlign="center" color={'#333'}>
            Email: liyanpei2004@outlook.com
          </Text>
          <Text fontSize={['16px', '18px']} textAlign="center" color={'#333'}>
            Mandarin, Cantonese, English
          </Text>
        </Flex>

        <Flex
          mt={8}
          w={['100%', '350px']}
          direction="column"
          alignItems="center"
          justifyContent="center"
        >
          {
            isMobile ? (
 <></>
      ) : (
        <Button
            size="25"
            w="100%"
            fontSize={['20px', '24px']}
            mb={6}
            onClick={() => window.open('https://hiko.dev/cv')}
          >
            Personal CV
          </Button>
      )
    }


          <Button
            size="25"
            w="100%"
            fontSize={['20px', '24px']}
            mb={6}
            onClick={() => window.open('https://github.com/HikoPLi')}
          >
            GitHub
          </Button>

          <Button
            size="25"
            w="100%"
            fontSize={['20px', '24px']}
            onClick={() => window.open('https://gitlab.com/HikoPLi')}
          >
            GitLab
          </Button>
        </Flex>
      </Flex>

      <Accordion allowToggle width="100%" maxW="400px" mt={8}>
        <AccordionItem>
          <AccordionButton _expanded={{ bg: 'gray.100' }}>
            <Flex
              flex="1"
              textAlign="left"
              fontWeight="bold"
              alignItems="center"
              justifyContent="center"
            >
              <Text fontSize="25" fontWeight="bold">
                LinkedIn
              </Text>
            </Flex>
            <AccordionIcon />
          </AccordionButton>

          <AccordionPanel pb={4}>
            <VStack
              spacing={4}
              align="stretch"
              alignItems="center"
              justifyContent="center"
            >
              {/* https://www.linkedin.com/in/liyanpeihiko/ */}
              <Button
                size="25"
                w="100%"
                fontSize={['20px', '24px']}
                mb={6}
                onClick={() =>
                  window.open('https://www.linkedin.com/in/liyanpeihiko/')
                }
              >
                LinkedIn
              </Button>
            </VStack>
            <VStack
              spacing={4}
              align="stretch"
              alignItems="center"
              justifyContent="center"
            >
              <LinkedInBadge />
            </VStack>
          </AccordionPanel>
        </AccordionItem>
      </Accordion>
    </Flex>
  )
}

export default PersonalInfo
