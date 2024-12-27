import React from 'react';
import { Box, Text, Link } from '@chakra-ui/react';

const Header: React.FC = () => {
    const baseURL = 'hiko.dev';
    const quickLinks = [
        { "name": "Home", "url": `${baseURL}/` },
        { "name": "About", "url": `${baseURL}/about` },
        { "name": "Contact", "url": `${baseURL}/contact` },
        { "name": "CV", "url": `${baseURL}/cv` }
    ];

    return (
        <Box 
            as="header" 
            w="100%" 
            p={4} 
            bg="gray.800" 
            color="white"
            textAlign="center"
            display="flex"
            flexDirection="column"
            alignItems="center"
        >
            <Text fontSize={{ base: 'lg', md: 'xl' }}>Welcome to HIKO DEV</Text>
            <Box 
                mt={2}
                display="flex"
                flexWrap="wrap"
                justifyContent="center"
                gap={{ base: '10px', md: '20px' }}
            >
                {quickLinks.map((link, index) => (
                    <Link 
                        key={index}  
                        href={`https://${link.url}`} 
                        isExternal 
                        px={2} 
                        whiteSpace="nowrap" 
                        color="teal.200"
                    >
                        {link.name}
                    </Link>
                ))}
            </Box>
        </Box>
    );
};

export default Header;