import React, { useEffect } from 'react'
import styled from '@emotion/styled'
import { useRouter } from 'next/router'
import { Box, useToast } from '@chakra-ui/react'
import LoadingScreen from '../components/General-UI/LoadingScreen'

const Custom404 = () => {
  const router = useRouter()
  const toast = useToast()

  useEffect(() => {
    toast({
      title: 'Page Not Found',
      description: 'Will back to home page after 3 seconds',
      status: 'error',
      duration: 3000,
      isClosable: true,
    })
    setTimeout(() => {
      // router.back()
      router.replace('/')
    }, 3000)

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <Wrapper>
      {/* <HeaderContainer>
          <HeaderTitle>404 Error</HeaderTitle>
        </HeaderContainer> */}
      <React.Fragment>
        <h1>404 - Page Not Found</h1>
        <LoadingScreen />
        {/* <Button onClick={() => {}}>Back</Button> */}
      </React.Fragment>
    </Wrapper>
  )
}

export default Custom404

const Wrapper = styled(Box)`
  max-width: 1200px;
  margin: 0 auto;
  padding: 20px;
  width: 100%;
  max-height: calc(100vh - 70px);
  /* justify-content: center;
  align-content: center; */
`

// const HeaderContainer = styled.div`
//   background-color: #559ec7;
// `

// const HeaderTitle = styled.h1`
//   display: flex;
//   color: white;
//   padding: 20px;
//   font-size: 20px;
//   font-weight: bold;
// `
