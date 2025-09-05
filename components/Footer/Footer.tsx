import React from 'react';
import { Box, Text, Link,  VStack, HStack } from '@chakra-ui/react';

const quickLinks = [
  { name: 'Home', url: `/` },
  { name: 'About', url: `/about` },
  { name: 'Contact', url: `/contact` },
  { name: 'CV', url: `/cv` },
];

const moreLinks = [
  { name: 'Crypto', url: `/crypto` },
  { name: 'Quick Payment', url: `/quick-payment` },
];

const socialLinks = [
  { name: 'GitHub', url: `https://github.com/HikoPLi` },
  { name: 'LinkedIn', url: `https://www.linkedin.com/in/liyanpeihiko/` },
  { name: 'WhatsApp', url: `https://wa.me/85262040827` },
];

const Footer: React.FC = () => {
  return (
    <Box as="footer" w="100%" p={4} bg="gray.800" color="white" textAlign="center">

      <VStack spacing={4}>
        <HStack spacing={4}>
          {quickLinks.map((link) => (
            <Link key={link.name} href={link.url} color="teal.200">
              {link.name}
            </Link>
          ))}
        </HStack>
        <HStack spacing={4}>
          {moreLinks.map((link) => (
            <Link key={link.name} href={link.url} color="teal.200">
              {link.name}
            </Link>
          ))}
        </HStack>
        <HStack spacing={4}>
          {socialLinks.map((link) => (
            <Link key={link.name} href={link.url} color="teal.200" isExternal>
              {link.name}
            </Link>
          ))}
        </HStack>
        <Text>
          &copy; {new Date().getFullYear()}{' '}
          <Link href="https://hiko.dev" isExternal color="teal.200">
            hiko.dev
          </Link>
          . All rights reserved.
        </Text>
      </VStack>
    </Box>
  );
};

export default Footer;