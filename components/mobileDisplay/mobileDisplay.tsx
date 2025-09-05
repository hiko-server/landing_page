import React, { useState, useEffect } from 'react';
import { Box, Button, Flex, Text, useColorModeValue, Collapse } from '@chakra-ui/react';

// 假设导入其他组件和布局
import PersonalInfo from '../LandingPage/PersonalInfo';
import LandingLayout from '../../layout/LandingLayout';

const DisplayMobileInfo = ({ isMobile,setIsMobile }: { isMobile: boolean,setIsMobile: React.Dispatch<React.SetStateAction<boolean>> }) => {
  const [screenSize, setScreenSize] = useState('');
  const [browserInfo, setBrowserInfo] = useState('');
  const [ipInfo, setIpInfo] = useState('Loading...');
  const [isDetailsOpen, setIsDetailsOpen] = useState(false);
  
  // 动态调整样式以适应移动端
  const textColor = useColorModeValue('gray.800', 'white');
  const buttonColor = useColorModeValue('blue.500', 'blue.200');

  useEffect(() => {
    setScreenSize(`${window.screen.width} x ${window.screen.height}`);
    setBrowserInfo(window.navigator.userAgent);

    // 假设有一个函数fetchIpInfo可以获取真实的IP信息
    fetchIpInfo().then(ipData => setIpInfo(ipData));
  }, []);

  const fetchIpInfo = async () => {
    try {
      const response = await fetch('https://api.ipify.org?format=json');
      const data = await response.json();
      return data.ip;
    } catch (error) {
      console.error("Failed to fetch IP info:", error);
      return "Unable to fetch IP address.";
    }
  };

  return (
    <LandingLayout>
      <Box mt={4}>
        <PersonalInfo isMobile={isMobile} />
        <Text mt={4} color={textColor}>
          <strong>Current Screen Size:</strong> {screenSize}
        </Text>
        <Text color={textColor}>
          <strong>Suggested Screen Size:</strong> 1920 x 1080
        </Text>
        <Text color={textColor}>
          <strong>Browser Info:</strong> {browserInfo}
        </Text>
        <Text color={textColor}>
          <strong>IP Info:</strong> {ipInfo}
        </Text>
        <Button 
          onClick={() => setIsDetailsOpen(!isDetailsOpen)} 
          mt={4}
          size="sm"
          bg={buttonColor}
          color="white"
        >
          Toggle Details
        </Button>
        <Collapse in={isDetailsOpen} unmountOnExit>
          <Box mt={4} p={4} borderWidth="1px" borderRadius="lg">
            <Text color={textColor}>
              <strong>Device Optimization Tips:</strong> Ensure your device's screen resolution matches the suggested size for optimal viewing experience.
            </Text>
            <Text mt={2} color={textColor}>
              <strong>Network Information:</strong> Your current network connection appears to be stable. For the best experience, ensure you're connected to a high-speed network.
            </Text>
            <Text mt={2} color={textColor}>
              <strong>Security Recommendations:</strong> Keep your browser and operating system up-to-date to ensure maximum security while browsing.
            </Text>
            <Text mt={2} color={textColor}>
              <strong>Privacy Notice:</strong> We collect certain information about your device and network for analytics purposes. This information is used to improve our services.
            </Text>
          </Box>
        </Collapse>
      </Box>
      <Flex direction="column" mt={4}>
        <Text>
          <strong>You can change to Desktop Version by clicking</strong>
        </Text>
        <Button 
          onClick={() => setIsMobile(false)} 
          ml={2} 
          size="sm"
          bg={buttonColor}
          color="white"
        >
          Desktop Version (Not Recommended)
        </Button>
      </Flex>
    </LandingLayout>
  );
}

export default DisplayMobileInfo;