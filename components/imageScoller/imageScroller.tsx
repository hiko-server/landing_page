import { Button, Flex, Img, Text, Link, useColorModeValue } from '@chakra-ui/react'
import { useEffect, useState } from 'react'
import Swipe from 'react-easy-swipe'
import { ImageCounter, ImageCounterWrapper } from './imageScrollerStyle'
import { GoArrowLeft, GoArrowRight } from 'react-icons/go'

export type ScrollerImage = { url: string; describe?: string; redirectTo?: string; visible?: boolean }

const ImageScroller = ({ images }: { images?: ScrollerImage[] }) => {
  const [positionx, setPositionx] = useState<number>(0)
  const [imgCount, setImgCount] = useState<number>(1)
  const data = (images || []).filter((i) => i.visible !== false)

  // Hooks must run unconditionally on every render. These colour values used to
  // sit AFTER the `if (!data.length) return null` guard below, which violated
  // the rules of hooks and could crash ("rendered fewer hooks than expected")
  // when a post's image array toggled between empty and non-empty.
  const activeDot = useColorModeValue('#2563eb', '#60a5fa')
  const inactiveDot = useColorModeValue('#a8a8a8', '#4b5563')
  const describeColor = useColorModeValue('gray.700', 'gray.200')

  const onSwipeMove = (position: { x: number }) => {
    if (data.length === 1) return
    if (imgCount === 1 && position.x < 0) setPositionx(position.x)
    if (imgCount > 1 && imgCount < data.length) setPositionx(position.x)
    if (imgCount === data.length && position.x > 0) setPositionx(position.x)
  }

  const onSwipeEnd = () => {
    if (positionx < -20) setImgCount(imgCount + 1)
    if (positionx > 20) setImgCount(imgCount - 1)
    setPositionx(0)
  }

  const handleNextClick = () => {
    if (imgCount < data.length) {
      setImgCount(imgCount + 1)
    } else {
      setImgCount(1)
    }
  }

  const handlePrevClick = () => {
    if (imgCount > 1) {
      setImgCount(imgCount - 1)
    } else {
      setImgCount(data.length)
    }
  }

  useEffect(() => {
    const intervalId = setInterval(() => {
      if (imgCount < data.length) {
        setImgCount(imgCount + 1)
      } else {
        setImgCount(1)
      }
    }, 5000)

    return () => clearInterval(intervalId)
  }, [imgCount])

  // If no images provided, render nothing (no fake defaults)
  if (!data.length) return null

  return (
    <Flex direction="column" alignItems="center" justifyContent="center">
      <Swipe onSwipeEnd={onSwipeEnd} onSwipeMove={onSwipeMove}>
        <Flex>
          {data.map((image, index) => (
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

      {data.length > 1 && <Text mt={2} color={describeColor}>{data[imgCount - 1].describe}</Text>}

      {data.length > 1 && (
        <ImageCounterWrapper>
          {data.map((_props, index) => (
            <ImageCounter key={index} index={index} imgCount={imgCount} activeColor={activeDot} inactiveColor={inactiveDot} />
          ))}
        </ImageCounterWrapper>
      )}

      <Flex direction="row" alignItems="center" justifyContent="center" mt={4}>
        <Button onClick={handlePrevClick} disabled={imgCount === 1}>
          <GoArrowLeft />
        </Button>
        <Button onClick={handleNextClick} disabled={imgCount === data.length}>
          <GoArrowRight />
        </Button>
      </Flex>
    </Flex>
  )
}

export default ImageScroller
