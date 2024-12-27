import React from 'react';
import { Box, Text, Link } from '@chakra-ui/react';

const Footer: React.FC = () => {
  return (
    <Box as="footer" w="100%" p={4} bg="gray.800" color="white" textAlign="center">
      <Text>
        &copy; {new Date().getFullYear()}{' '}
        <Link href="https://hiko.dev" isExternal color="teal.200">
          hiko.dev
        </Link>
        . All rights reserved.
      </Text>
    </Box>
  );
};

export default Footer;