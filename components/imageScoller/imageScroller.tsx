import { Button, Flex, Img, Text, Link } from '@chakra-ui/react'
import { useEffect, useState } from 'react'
import Swipe from 'react-easy-swipe'
import { ImageCounter, ImageCounterWrapper } from './imageScrollerStyle'
import { GoArrowLeft, GoArrowRight } from 'react-icons/go'

const images = [
  {
    url: 'https://media.licdn.com/dms/image/v2/D562DAQFK5Ha4rHPKEA/profile-treasury-image-shrink_800_800/profile-treasury-image-shrink_800_800/0/1733489855897?e=1735610400&v=beta&t=6t-DVCdO8WG5sgA5pAzCOEc1JF7fQ_L9dhps6DLfV3o',
    describe: 'COT - Start-Up Saturday of HKBU - Wegreen AI',
    redirectTo: 'https://wegreen.ltd',
  },
  {
    url: 'https://media.licdn.com/dms/image/v2/D4D2DAQERZ9h-FslUiQ/profile-treasury-image-shrink_800_800/profile-treasury-image-shrink_800_800/0/1727107662819?e=1735610400&v=beta&t=SuY-LgEXtG4yCrj3r2hrWhxcPbP4hto9nif4kOlQkTg',
    describe: 'Stuff - Exhibition in HK - Honsenn',
    redirectTo: 'https://honsennaudio.com/',
  },
  {
    url: 'https://media.licdn.com/dms/image/v2/D4D2DAQFzb5Y0nWytqw/profile-treasury-image-shrink_800_800/profile-treasury-image-shrink_800_800/0/1727107163440?e=1735610400&v=beta&t=IHt_sX9nLs7o4_Vm8SxYu_D0KoSoM1UAJ6WsSs-Gm1w',
    describe: 'Student - Prensentation of final project - UOWCHK',
    redirectTo: 'https://www.uowchk.edu.hk/',
  },
  {
    url: 'https://media.licdn.com/dms/image/v2/D4D2DAQGMVgyO_pJcnQ/profile-treasury-image-shrink_800_800/profile-treasury-image-shrink_800_800/0/1727107249132?e=1735610400&v=beta&t=-73AVD-cYIkqgz7KfitGadde7pNIexYJ0aNVqkPsqCQ',
    describe: 'Student - Project Test - UOWCHK',
    redirectTo: 'https://www.uowchk.edu.hk/',
  },
]

const ImageScroller = () => {
  const [positionx, setPositionx] = useState<number>(0)
  const [imgCount, setImgCount] = useState<number>(1)
  const [_endSwipe, setEndSwipe] = useState<boolean>(false)

  const onSwipeMove = (position: { x: number }) => {
    setEndSwipe(false)
    if (images.length === 1) return
    if (imgCount === 1 && position.x < 0) setPositionx(position.x)
    if (imgCount > 1 && imgCount < images.length) setPositionx(position.x)
    if (imgCount === images.length && position.x > 0) setPositionx(position.x)
  }

  const onSwipeEnd = () => {
    if (positionx < -20) setImgCount(imgCount + 1)
    if (positionx > 20) setImgCount(imgCount - 1)
    setPositionx(0)
    setEndSwipe(true)
  }

  const handleNextClick = () => {
    if (imgCount < images.length) {
      setImgCount(imgCount + 1)
    } else {
      setImgCount(1)
    }
  }

  const handlePrevClick = () => {
    if (imgCount > 1) {
      setImgCount(imgCount - 1)
    } else {
      setImgCount(images.length)
    }
  }

  useEffect(() => {
    const intervalId = setInterval(() => {
      if (imgCount < images.length) {
        setImgCount(imgCount + 1)
      } else {
        setImgCount(1)
      }
    }, 5000)

    return () => clearInterval(intervalId)
  }, [imgCount])

  return (
    <Flex direction="column" alignItems="center" justifyContent="center">
      <Swipe onSwipeEnd={onSwipeEnd} onSwipeMove={onSwipeMove}>
        <Flex>
          {images.map((image, index) => (
            <Link key={index} href={image.redirectTo} isExternal>
              <Img
                src={image.url}
                alt={`Image ${index}`}
                display={imgCount === index + 1 ? 'block' : 'none'}
                onClick={() =>
                  console.log(`Navigating to: ${image.redirectTo}`)
                }
                w="600px"
                h="400px"
                objectFit="cover"
                borderRadius="md"
                boxShadow="lg"
              />
            </Link>
          ))}
        </Flex>
      </Swipe>

      {images.length > 1 && <Text mt={2}>{images[imgCount - 1].describe}</Text>}

      {images.length > 1 && (
        <ImageCounterWrapper>
          {images.map((_props, index) => (
            <ImageCounter key={index} index={index} imgCount={imgCount} />
          ))}
        </ImageCounterWrapper>
      )}

      <Flex direction="row" alignItems="center" justifyContent="center" mt={4}>
        <Button onClick={handlePrevClick} disabled={imgCount === 1}>
          <GoArrowLeft />
        </Button>
        <Button onClick={handleNextClick} disabled={imgCount === images.length}>
          <GoArrowRight />
        </Button>
      </Flex>
    </Flex>
  )
}

export default ImageScroller
