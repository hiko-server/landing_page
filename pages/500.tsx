import { useMediaQuery } from '@chakra-ui/react'
import CustomHead from '../components/General-UI/CustomHead'
import ErrorPageState from '../components/General-UI/ErrorPageState'
import HeaderFooter from '../layout/HeaderFooter'

export default function Custom500() {
  const [isMobile] = useMediaQuery('(max-width: 767px)')

  return (
    <>
      <CustomHead
        title="Server Error"
        description="Something went wrong while loading this page."
        url="https://hiko.dev/500"
        image="/images/hikoAvator.png"
        type="website"
        robots="noindex,nofollow"
      />
      <HeaderFooter isMobile={isMobile}>
        <ErrorPageState
          code="500"
          title="Something went wrong on our side"
          description="The request reached the site, but the page could not be completed successfully."
          guidance="Try refreshing, go back to a stable page, or use the contact page if the problem keeps happening."
        />
      </HeaderFooter>
    </>
  )
}
