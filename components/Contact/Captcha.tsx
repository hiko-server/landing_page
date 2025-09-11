import React, { useEffect, useRef } from "react";
import { Box } from "@chakra-ui/react";
import HCaptcha from "@hcaptcha/react-hcaptcha";
import { useColorMode } from '@chakra-ui/react'

interface CaptchaProps {
  updateToken: React.Dispatch<React.SetStateAction<string | null>>;
  shouldReset: boolean;
  updateReset: React.Dispatch<React.SetStateAction<boolean>>;
}

const Captcha = ({
  updateToken,
  shouldReset,
  updateReset
}: CaptchaProps): JSX.Element => {
  const captchaRef = useRef<HCaptcha>(null);
  const { colorMode } = useColorMode()

  const onExpire = () => {
    updateToken(null);
  };

  const onError = (_err: unknown) => {
    // noop
  };

  useEffect(() => {
    if (shouldReset) {
      updateReset(false);
      captchaRef.current?.resetCaptcha();
    }
  }, [shouldReset, updateReset]);

  useEffect(() => {}, []);

  return (
    <Box h="auto" w="auto">
      <HCaptcha
        sitekey={
          process.env.NEXT_PUBLIC_HCAPTCHA_KEY
            ? process.env.NEXT_PUBLIC_HCAPTCHA_KEY
            : ""
        }
        onVerify={updateToken}
        onError={onError}
        onExpire={onExpire}
        theme={colorMode === 'dark' ? 'dark' : 'light'}
        ref={captchaRef}
      />
    </Box>
  );
};

export default Captcha;
