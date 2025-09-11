import React from 'react';
import { Box, Text, Link,  VStack, HStack, useColorModeValue } from '@chakra-ui/react';

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
  const bg = useColorModeValue('gray.100','gray.800')
  const color = useColorModeValue('gray.700','gray.100')
  const linkColor = useColorModeValue('teal.600','teal.200')
  return (
    <Box as="footer" w="100%" p={4} bg={bg} color={color} textAlign="center">

      <VStack spacing={4}>
        <HStack spacing={4}>
          {quickLinks.map((link) => (
            <Link key={link.name} href={link.url} color={linkColor}>
              {link.name}
            </Link>
          ))}
        </HStack>
        <HStack spacing={4}>
          {moreLinks.map((link) => (
            <Link key={link.name} href={link.url} color={linkColor}>
              {link.name}
            </Link>
          ))}
        </HStack>
        <HStack spacing={4}>
          {socialLinks.map((link) => (
            <Link key={link.name} href={link.url} color={linkColor} isExternal>
              {link.name}
            </Link>
          ))}
        </HStack>
        <Text>
          &copy; {new Date().getFullYear()}{' '}
          <Link href="https://hiko.dev" isExternal color={linkColor}>
            hiko.dev
          </Link>
          . All rights reserved.
        </Text>
      </VStack>
    </Box>
  );
};

export default Footer;
