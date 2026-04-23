import { useRef } from 'react'
import styled from 'styled-components'
import { Flex, Text } from '@chakra-ui/react'
import { useRouter } from 'next/router'

import { VPColor } from '../../theme/color'
import { ChevronLeft } from '@mui/icons-material'

// import { AppContext, AppActions } from '../context/state'

const Header = ({
  title,
  willBack,
  style,
}: {
  title?: string
  willBack?: boolean
  style?: React.CSSProperties
}) => {
  const router = useRouter()
  const titleL = title == undefined ? 'Event' : title
  // const [isSigningOut, setIsSigningOut] = useState(false)

  const headerRef = useRef(null)
  // const dimensions = useDimensions(headerRef)
  // const appData = useContext(AppContext)

  // const lazyRoot = React.useRef(null)

  // useEffect(() => {
  //   console.log('header height', dimensions?.borderBox.height)
  //   appData.dispatch({
  //     type: AppActions.UPDATE_NAVBARHEIGHT,
  //     headerHeight:
  //       dimensions?.borderBox.height != undefined
  //         ? dimensions?.borderBox.height
  //         : 70,
  //   })
  // }, [dimensions])

  return (
    <Flex
      direction={'row'}
      zIndex={999}
      p={'20px'}
      h={'70px'}
      color={'white'}
      top={'56px'}
      position={'sticky'}
      bgColor={VPColor.index.blue}
      justifyContent={'space-between'}
      alignItems={'center'}
      style={style}
      ref={headerRef}
    >
      <Flex
        direction={'row'}
        justifyItems={'center'}
        alignItems={'center'}
        fontSize={'20px'}
        fontWeight={'700'}
      >
        <BackIconContainer
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
        </BackIconContainer>
        <Text style={{ paddingLeft: '20px' }}>{titleL}</Text>
      </Flex>
    </Flex>
  )
}

export default Header

const BackIconContainer = styled(Flex)`
  cursor: pointer;
`
