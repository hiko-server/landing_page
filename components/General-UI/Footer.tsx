import { useRef } from 'react'
import styled from 'styled-components'
import { Box, Flex, Text, Image } from '@chakra-ui/react'
import { footerHeight, sidebarWidth } from '../../theme/constant'
import { useMediaQuery } from 'react-responsive'

// import Image from 'next/image'
// import EBLogo from '../../public/images/EB-logo_2021_word_transparent.png'

// import { AppContext, AppActions } from '../context/state'

const Footer = () =>
  // {displayLanguageButton,}: {displayLanguageButton?: boolean}
  {
    // const router = useRouter()
    // const titleL = title == undefined ? 'Event' : title

    const footerRef = useRef(null)
    // const dimensions = useDimensions(footerRef)
    // const appData = useContext(AppContext)

    // const lazyRoot = React.useRef(null)

    // useEffect(() => {
    //   console.log('footer height', dimensions?.borderBox.height)
    //   appData.dispatch({
    //     type: AppActions.UPDATE_NAVBARHEIGHT,
    //     footerHeight:
    //       dimensions?.borderBox.height != undefined
    //         ? dimensions?.borderBox.height
    //         : 39.5,
    //   })
    // }, [dimensions])
    const isMobileDevice = useMediaQuery({ query: '(max-width: 900px)' })
    return (
      <React.Fragment>
        <FooterContainer
          flexDirection={'row'}
          // padding={'10px'}
          paddingX={isMobileDevice ? '20px' : '0px'}
          paddingY={'20px'}
          // paddingLeft={'20px'}
          bgColor="white"
          ref={footerRef}
          // bottom={'0px'}
          // position={'sticky'}
          alignItems={'center'}
          alignContent={'center'}
          justifyContent={'center'}
          // minW={isMobileDevice ? '100%' : `calc(100% - ${sidebarWidth}px)`}
          w={'100%'}
          // // maxW={'1200px'}
          // bgColor={'#32d6ff'}
        >
          {/* <BackIconContainer
          alignItems={'center'}
          style={style}
          //   style={{ border: '0px', borderRadius: '200px' }}
          color={'white'}
          //   bgColor={'red'}
          onClick={() => {
            if (willBack != undefined && willBack) {
              router.back()
            }
            return false
          }}
        >
          {willBack != undefined && <ChevronLeft />}
        </BackIconContainer> */}
          <Flex
            flex={1}
            direction="row"
            justifyContent={'center'}
            // alignItems={'center'}
            // backgroundColor={'#ff8419'}
            minW={isMobileDevice ? '100%' : `calc(100% - ${sidebarWidth}px)`}
            maxW={isMobileDevice ? '100%' : `calc(100% - ${sidebarWidth}px)`}
            // maxW={isMobileDevice ? '100%' : '1200px'}
            // maxW={isMobileDevice ? '100%' : `calc(100% - ${sidebarWidth}px)`}
            // // flex={1}
            // minW={isMobileDevice ? '100%' : `calc(100% - ${sidebarWidth}px)`}
            // minW={isMobileDevice ? '100%' : `calc(100vw - ${sidebarWidth}px)`}
            // minW={isMobileDevice ? '100%' : `900px`}
          >
            <Flex
              // paddingX={isMobileDevice ? '16px' : '20px'}
              // backgroundColor={'#19ff38'}
              maxW={isMobileDevice ? '100%' : '1200px'}
              minW={'100%'}
              // minW={isMobileDevice ? '100%' : `calc(100% - ${sidebarWidth}px)`}
              // flex={1}
              // minW={isMobileDevice ? '100%' : `calc(100vw - ${sidebarWidth}px)`}
              // minW={isMobileDevice ? '100%' : `900px`}
              h={`${footerHeight}px`}
            >
              <Flex
                direction="row"
                justifyContent={'flex-start'}
                alignItems={'center'}
                // backgroundColor={'#f7ff11'}
              >
                <FooterTitle fontSize="10px">{'Powered by '}</FooterTitle>
                <Box w={'80px'} marginTop="0px" marginLeft="5px">
                  <Image
                    // boxSize="18px"
                    object-fit={'contain'}
                    src={
                      // 'https://s.yimg.com/rz/p/yahoo_news_zh-Hant-HK_h_p_newsv2.png'
                      'https://dev.eatmatye.com/nextimg/%2F_next%2Fstatic%2Fimages%2FEB-logo+final_word-caa8c6252bf9418c72337e265c937b71.png/1920/75?url=%2F_next%2Fstatic%2Fimages%2FEB-logo%20final_word-caa8c6252bf9418c72337e265c937b71.png&w=1920&q=75'
                    }
                    alt="EB-logo"
                  />
                </Box>
              </Flex>
            </Flex>
          </Flex>
        </FooterContainer>
      </React.Fragment>
    )
  }

export default React.memo(Footer)

const FooterContainer = styled(Flex)`
  /* direction: row; */
  /* align-items: center; */
  /* justify-items: center; */
  /* background-color: white; */
  /* padding: 10px; */
  z-index: 299;
`
const FooterTitle = styled(Text)`
  color: black;
  /* padding-left: 5px; */
  /* font-size: 10px; */
  /* line-height: 20px; */
  font-weight: 400;
`
// const BackIconContainer = styled(Flex)`
//   cursor: pointer;
// `
