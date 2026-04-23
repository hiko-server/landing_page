import { useMediaQuery } from '@chakra-ui/react'
import CustomHead from '../components/General-UI/CustomHead'
import ErrorPageState from '../components/General-UI/ErrorPageState'
import HeaderFooter from '../layout/HeaderFooter'

const Custom404 = () => {
  const [isMobile] = useMediaQuery('(max-width: 767px)')

  return (
    <>
      <CustomHead
        title="Page Not Found"
        description="The page you requested could not be found."
        url="https://hiko.dev/404"
        image="/images/hikoAvator.png"
        type="website"
        robots="noindex,nofollow"
      />
      <HeaderFooter isMobile={isMobile}>
        <ErrorPageState
          code="404"
          title="This page isn’t here anymore"
          description="The link may be outdated, the address may be mistyped, or the content may have moved."
          guidance="Try heading back to the homepage, opening the CV, or contacting Hiko if you were following an old shared link."
        />
      </HeaderFooter>
    </>
  )
}

export default Custom404
