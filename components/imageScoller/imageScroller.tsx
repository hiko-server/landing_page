import { Button, Flex, Img, Text, Link } from '@chakra-ui/react'
import { useEffect, useState } from 'react'
import Swipe from 'react-easy-swipe'
import { ImageCounter, ImageCounterWrapper } from './imageScrollerStyle'
import { GoArrowLeft, GoArrowRight } from 'react-icons/go'

const images = [
  {
    url: 'https://theinsatiabletraveler.com/wp-content/uploads/2015/08/Cape-Point-Day-Trip-7117.jpg',
    describe: 'test 1',
    redirectTo: '/some-page-1',
  },
  {
    url: 'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcQiNB3Z62gMn49v5t49v-cRlLXxlmy0kA-ihQ&s',
    describe: 'test 2',
    redirectTo: '/some-page-2',
  },
  {
    url: 'https://www.discoverhongkong.com/content/dam/dhk/intl/explore/attractions/the-charm-of-the-bright-city/the-charm-of-the-bright-city-1920x1080.jpg',
    describe: 'test 3',
    redirectTo: '/some-page-1',
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
