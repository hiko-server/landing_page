import React from 'react'
import styled from 'styled-components'
import { Flex } from '@chakra-ui/react'

import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faCompactDisc } from '@fortawesome/free-solid-svg-icons'
import { VPColor } from '../../theme/color'

const LoadingScreen = () => {
  return (
    <React.Fragment>
      {/* <Box zIndex={999}> */}
      <Flex
        alignItems={'center'}
        justifyContent={'center'}
        w={'100%'}
        h={'100%'}
        // h={'calc(100vh - 110px)'}
        flexDir={'column'}
        // backgroundColor={'red'}
        // flexGrow={1}
      >
        <Flex
        // flex={1}
        // bgColor={VPColor.grey}
        // justifyContent="center" // flexGrow={1}
        // direction={'column'}
        // style={{ height: `calc(100vh - ${headerHeight}px - 40px)` }}
        // w={'100%'}
        // h={'100%'}
        >
          <FontAwesomeIconAnimated
            icon={faCompactDisc}
            className="fa-solid fa-8x fa-spin"
            color={VPColor.index.blue}
            // style={
            //   '--fa-animation-duration: 30s; --fa-animation-iteration-count: 1;'
            // }
          />
        </Flex>
      </Flex>
      {/* </Box> */}
    </React.Fragment>
  )
}
export default LoadingScreen

const FontAwesomeIconAnimated = styled(FontAwesomeIcon)`
  --fa-animation-duration: 5s;
  --fa-animation-iteration-count: 9999;
`
