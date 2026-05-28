import { useSession } from 'next-auth/react'
import React, { useEffect, useState } from 'react'
import { Box, useMediaQuery } from '@chakra-ui/react'

import HeaderFooter from '../../layout/HeaderFooter'
import Payment from '../../components/QuickPayment/Payment'
import CustomHead from '../../components/General-UI/CustomHead'

/**
 * /quick-payment — payment-method directory page.
 * v6 chrome only: page is already simple, the Payment widget owns its layout
 * (see components/QuickPayment/Payment.tsx — refreshed in Phase I).
 */
const QuickPayment = (props: any) => {
  useSession()
  const [, setIsHostCV] = useState<boolean>(false)
  const [isMobile] = useMediaQuery('(max-width: 767px)')

  useEffect(() => {
    if (props.host && props.host === 'cv.hiko.dev') setIsHostCV(true)
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
        <Box maxW="var(--container-content)" mx="auto" px={[4, 6, 8]} py={[6, 10]}>
          <Payment />
        </Box>
      </HeaderFooter>
    </React.Fragment>
  )
}

export default QuickPayment
