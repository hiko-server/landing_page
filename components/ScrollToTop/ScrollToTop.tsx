import { useState, useEffect } from 'react';
import { IconButton } from '@chakra-ui/react';
import { ChevronUpIcon } from '@chakra-ui/icons';

const ScrollToTop: React.FC = () => {
  const [isVisible, setIsVisible] = useState(false);

  const toggleVisibility = () => {
    if (window.pageYOffset > 100) {
      setIsVisible(true);
    } else {
      setIsVisible(false);
    }
  };

  const scrollToTop = () => {
    window.scrollTo({
      top: 0,
      behavior: 'smooth',
    });
  };

  useEffect(() => {
    window.addEventListener('scroll', toggleVisibility);
    return () => {
      window.removeEventListener('scroll', toggleVisibility);
    };
  }, []);

  return (
    <IconButton
      icon={<ChevronUpIcon />}
      onClick={scrollToTop}
      position="fixed"
      bottom="50px"
      right="10px"
      zIndex="1000"
      size="lg"
    //   colorScheme="teal"
      aria-label="Scroll to top"
      display={isVisible ? 'inline-flex' : 'none'}
    />
  );
};

export default ScrollToTop;