import React from 'react';
import {
  Box,
  Text,
  Button,
  Drawer,
  DrawerOverlay,
  DrawerContent,
  DrawerHeader,
  DrawerBody,
  DrawerFooter,
  useDisclosure,
  useBreakpointValue,
  Flex,
  IconButton,
  Icon,
  Link,
} from '@chakra-ui/react';
import { useRouter } from 'next/router';
import { FaBars } from "react-icons/fa"; 
import Footer from '../Footer/Footer';

const Header = () => {
  const baseURL = 'hiko.dev';
  const quickLinks = [
    { name: "Home", url: `/` },
    { name: "About", url: `/about` },
    { name: "Contact", url: `/contact` },
    { name: "CV", url: `https://${baseURL}/cv` },
    { name: "GitHub", url: `https://github.com/HikoPLi` },
    { name: "Linkedin", url: `https://www.linkedin.com/in/liyanpeihiko/` }
  ];

  const router = useRouter();
  const { isOpen, onOpen, onClose } = useDisclosure();


  const isMobile = useBreakpointValue({ base: true, md: false });

  return (
    <>
      <Box
        as="header"
        w="100%"
        p={4}
        bg="gray.800"
        color="white"
        textAlign="center"
        display="flex"
        justifyContent="space-between" 
        alignItems="center" 
      >
        <Link href='/'><Text fontSize={{ base: 'lg', md: 'xl' }}>HIKO DEV</Text></Link>

        
        {isMobile ? (
          <IconButton
            icon={<Icon as={FaBars} />}
            onClick={onOpen}
            variant="outline"
            borderColor="teal.200"
            _hover={{ bg: 'teal.200', color: 'gray.800' }}
            aria-label="Open Menu"
          />
        ) : (
          
          <Flex gap={4}>
            {quickLinks.map((link) => (
              <Button
                key={link.name}
                onClick={() => router.push(link.url)}
                px={4}
                py={2}
                whiteSpace="nowrap"
                color="teal.200"
                variant="outline"
                borderColor="teal.200"
                _hover={{ bg: 'teal.200', color: 'gray.800' }}
              >
                {link.name}
              </Button>
            ))}
          </Flex>
        )}
      </Box>

      {/* Side Drawer */}
      <Drawer isOpen={isOpen} placement="left" onClose={onClose}>
        <DrawerOverlay />
        <DrawerContent>
          <DrawerHeader borderBottomWidth="1px">Quick Links</DrawerHeader>
          <DrawerBody>
            <Flex direction="column" gap={2}>
            {quickLinks.map((link) => (
              <Button
                key={link.name}
                onClick={() => {
                  router.push(link.url);
                  onClose(); // Close drawer after navigation
                }}
                px={4}
                py={2}
                whiteSpace="nowrap"
                color="teal.200"
                variant="outline"
                borderColor="teal.200"
                mb={2}
                _hover={{ bg: 'teal.200', color: 'gray.800' }}

              >
                {link.name}
              </Button>
            ))}
            
            </Flex>
          </DrawerBody>
          <DrawerFooter borderTopWidth="1px">
            <Flex direction="column" gap={2}>
            <Button variant="outline" mr={3} onClick={onClose}>
              Cancel
            </Button>
            <Footer/>
            </Flex>
          </DrawerFooter>
        </DrawerContent>
      </Drawer>
    </>
  );
};

export default Header;