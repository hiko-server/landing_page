import React from 'react';
import { Box, Text } from '@chakra-ui/react';

const Footer: React.FC = () => {
  return (
    <Box as="footer" w="100%" p={4} bg="gray.800" color="white" textAlign="center">
      <Text>&copy; {new Date().getFullYear()} hiko.dev. All rights reserved.</Text>
    </Box>
  );
};

export default Footer;