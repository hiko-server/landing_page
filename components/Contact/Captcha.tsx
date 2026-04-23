import { useEffect, useRef } from 'react'
import { Box, useColorMode } from '@chakra-ui/react'
import HCaptcha from '@hcaptcha/react-hcaptcha'

interface CaptchaProps {
  updateToken: React.Dispatch<React.SetStateAction<string | null>>
  shouldReset: boolean
  updateReset: React.Dispatch<React.SetStateAction<boolean>>
}

const Captcha = ({
  updateToken,
  shouldReset,
  updateReset,
}: CaptchaProps): JSX.Element => {
  const captchaRef = useRef<HCaptcha>(null)
  const { colorMode } = useColorMode()
  const siteKey =
    process.env.NEXT_PUBLIC_HCAPTCHA_SITE_KEY ||
    process.env.NEXT_PUBLIC_HCAPTCHA_KEY ||
    ''

  useEffect(() => {
    if (!shouldReset) return

    updateReset(false)
    updateToken(null)
    captchaRef.current?.resetCaptcha()
  }, [shouldReset, updateReset, updateToken])

  return (
    <Box h="auto" w="auto">
      <HCaptcha
        sitekey={siteKey}
        onVerify={updateToken}
        onError={() => updateToken(null)}
        onExpire={() => updateToken(null)}
        theme={colorMode === 'dark' ? 'dark' : 'light'}
        ref={captchaRef}
      />
    </Box>
  )
}

export default Captcha
