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
} from '@chakra-ui/react'
import { useRouter } from 'next/router'
import 'react-photo-view/dist/react-photo-view.css'
import ImageScroller from '../imageScoller/imageScroller'

const Content = () => {
  const router = useRouter()

  return (
    <Flex
      direction="column"
      alignItems="center"
      justifyContent="center"
      p={['20px', '40px']}
      gap={['20px', '40px']}
    >
      <Flex
        direction="column"
        flex={1}
        alignItems="center"
        justifyContent="center"
        h="100%"
        overflowY={router.asPath.includes('edit') ? 'scroll' : 'hidden'}
        p="0px"
        gap={['20px', '40px']}
      >
        <Text
          fontSize={['20px', '22px']}
          textAlign="center"
          maxW="600px"
          fontWeight="bold"
        >
          Passionate Self-Taught Full-Stack Software Engineer | Exploring
          Innovative Solutions in Computer Science | Typescript | React |
          Next.js | NestJS | Python FastAPI
        </Text>
        {/* vvv image scroller vvv */}
        <ImageScroller />
        {/* ^^^ image scroller ^^^ */}

        <Accordion allowToggle width="100%" maxW="400px" mt={[4, 8]}>
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
                  Quick Access
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
                <Flex
                  mt={8}
                  w={['100%', '350px']}
                  direction="column"
                  alignItems="center"
                  justifyContent="center"
                >
                  <Button
                    size="25"
                    w="70%"
                    fontSize={'24px'}
                    mb={3}
                    onClick={() => window.open('https://asa.hiko-prime.com/')}
                  >
                    ASA
                  </Button>
                  <Button
                    size="25"
                    w="70%"
                    fontSize={'24px'}
                    mb={6}
                    onClick={() => window.open('https://hiko.dev/cv/edit')}
                  >
                    CV Generator Demo
                  </Button>
                </Flex>
              </VStack>
            </AccordionPanel>
          </AccordionItem>
        </Accordion>
      </Flex>
    </Flex>
  )
}

export default Content
