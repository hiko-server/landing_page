import { Box } from '@chakra-ui/react'
import Footer from '../components/Footer/Footer'
import Header from '../components/Header/Header'

const HeaderFooter = ({
  children,
  isMobile,
}: {
  children: React.ReactNode
  isMobile: boolean
}) => {
  return (
    <Box
      display="grid"
      gridTemplateRows="auto 1fr auto"
      minHeight="100vh"
      w="full"
    >
      <Header isMobile={isMobile} />
      <Box>{children}</Box>
      <Footer />
    </Box>
  )
}

export default HeaderFooter
