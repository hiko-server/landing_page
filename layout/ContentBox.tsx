import { Flex, Text } from '@chakra-ui/react'
import React from 'react'
// import { CustomComponentStyle } from "../theme/customComponentStyle"
interface ContentBoxProps {
  children: React.ReactNode
  isOverflow?: boolean
  style?: React.CSSProperties
  name?: string
}

const ContentBox = ({
  children,
  name,
  // isOverflow = false,
  style,
}: ContentBoxProps) => {
  return (
    <React.Fragment>
      <Flex
        flex={1}
        padding={'40px'}
        borderRadius={'40px'}
        backgroundColor={'red'}
        style={style}
      >
        <Flex
          flex={1}
          bgColor={'#1eff00'}
          direction={'column'}
          justifyContent={'center'}
          alignItems={'center'}
          // overflowY={isOverflow ? 'scroll' : undefined}
          // css={{ '&::-webkit-scrollbar': { display: 'none' } }}
        >
          {name ? (
            <Flex
              //   flex={1}
              bg={'#a6ff00'}
              justifyContent={'center'}
              alignItems={'center'}
              borderRadius={'20px'}
              borderWidth={'2px'}
              borderColor={'black'}
              px={'20px'}
              py={'10px'}
            >
              <Text fontSize="20px">{`${name} Panel`}</Text>
            </Flex>
          ) : (
            <Flex></Flex>
          )}
          {children}
        </Flex>
      </Flex>
    </React.Fragment>
  )
}

export default ContentBox
