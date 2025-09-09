import { useSession } from 'next-auth/react'
import React, { useEffect, useState } from 'react'

import { Flex, Text, useMediaQuery } from '@chakra-ui/react'

import HeaderFooter from '../../layout/HeaderFooter'
import Payment from '../../components/QuickPayment/Payment'
import CustomHead from '../../components/General-UI/CustomHead'

const QuickPayment = (props: any) => {
  console.log('props', props)

  const { data: session, status } = useSession()
  console.log('session', session)
  console.log('status', status)
  console.log(session?.accessToken)

  const [, setIsHostCV] = useState<boolean>(false)
  const [isMobile] = useMediaQuery('(max-width: 767px)')

  useEffect(() => {
    if (props.host && props.host === 'cv.hiko.dev') {
      setIsHostCV(true)
    }
  }, [props.host])

  return (
    <React.Fragment>
      <CustomHead
        title="Quick Payment"
        description="Simple payment page. Channels and risk controls documented."
        url={`https://${props.host || 'hiko.dev'}/quick-payment`}
        image="/images/hikoAvator.png"
      />
      <HeaderFooter isMobile={isMobile}>
        <Flex direction="column" alignItems="center" justifyContent="center" p={['20px', '40px']} gap={['10px', '20px']}>
          <Text fontSize="sm" color="gray.600">
            Note: Payments are subject to verification and anti-fraud checks. Supported channels: bank transfer, crypto USDT. Contact first for details.
          </Text>
          <Payment />
        </Flex>
      </HeaderFooter>
    </React.Fragment>
  )
}

export default QuickPayment
