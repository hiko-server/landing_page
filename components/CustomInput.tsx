import { Flex, Box, Text } from '@chakra-ui/react'
import React from 'react'

// const productionMode = process.env.NEXT_PUBLIC_PRODUCTION_MODE === 'production'
const productionMode = true

const CustomInput = ({
    name,
    children,
    alignCenter,
}: {
    name: string
    children: React.ReactNode | null
    alignCenter?: boolean
}) => {
    return (
        <React.Fragment>
            <Flex
                w={'100%'}
                direction="column"
                align={alignCenter ? 'center' : 'left'}
                paddingBottom="8px"
                bgColor={productionMode ? 'transparent' : '#ea901a'}
            >
                <Box
                    // maxW="900px"
                    w="100%"
                    bgColor={productionMode ? 'transparent' : '#aedfff'}
                >
                    <Text fontSize="16px" textColor="#090909" pb="8px">
                        {name}
                    </Text>
                    <React.Fragment>{children}</React.Fragment>
                </Box>
            </Flex>
        </React.Fragment>
    )
}

export default CustomInput
