import React from 'react';
import { Box, Text, Link } from '@chakra-ui/react';


const Header: React.FC = () => {
    const baseURL = 'hiko.dev'
    const quickLinks =[
        {
          "name": "Home",
          "url": `${baseURL}/`
        },
        {
          "name": "About",
          "url": `${baseURL}/about`
        },
        {
          "name": "Contact",
          "url": `${baseURL}/contact`
        },
        {
            "name": "CV",
            "url": `${baseURL}/cv`
          }
      ]
  return (
    <Box as="header" w="100%" p={4} bg="gray.800" color="white" textAlign="center">
      <Text fontSize="xl">Welcome to HIKO DEV</Text>
      <Box mt={2}>
        {quickLinks.map((link, index) => (
          <Link key={index}  href={`https://${link.url}`} isExternal m={2} color="teal.200" >
            {link.name}
          </Link>
        ))}
      </Box>
    </Box>
  );
};

export default Header;