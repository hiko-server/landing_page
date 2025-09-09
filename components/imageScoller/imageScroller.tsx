import { Button, Flex, Img, Text, Link } from '@chakra-ui/react'
import { useEffect, useState } from 'react'
import Swipe from 'react-easy-swipe'
import { ImageCounter, ImageCounterWrapper } from './imageScrollerStyle'
import { GoArrowLeft, GoArrowRight } from 'react-icons/go'

export type ScrollerImage = { url: string; describe?: string; redirectTo?: string; visible?: boolean }

const defaultImages: ScrollerImage[] = [
  {
    url: '/images/imageScroller/COT.png',
    describe: 'COT - Start-Up Saturday of HKBU - Wegreen AI',
    redirectTo: 'https://wegreen.ltd',
  },
  {
    url: '/images/imageScroller/wegreenAI_hkstp.jpeg',
    describe: 'COT - Youth Vision Breeds Green Action - Wegreen AI',
    redirectTo: 'https://wegreen.ltd',
  },
  {
    url: '/images/imageScroller/stuff.png',
    describe: 'Stuff - Exhibition in HK - Honsenn',
    redirectTo: 'https://honsennaudio.com/',
  },
  {
    url: '/images/imageScroller/student.png',
    describe: 'Student - Prensentation of final project - UOWCHK',
    redirectTo: 'https://www.uowchk.edu.hk/',
  },
  {
    url: '/images/imageScroller/fyp.png',
    describe: 'Student - Project Test - UOWCHK',
    redirectTo:
      'https://drive.google.com/drive/folders/1AZWZR9o1Sjp-V1ky5TL2UpjtdJFmEM0q?usp=drive_link',
  },
]

const ImageScroller = ({ images }: { images?: ScrollerImage[] }) => {
  const [positionx, setPositionx] = useState<number>(0)
  const [imgCount, setImgCount] = useState<number>(1)
  const [_endSwipe, setEndSwipe] = useState<boolean>(false)
  const data = (images && images.length ? images : defaultImages).filter((i) => i.visible !== false)

  const onSwipeMove = (position: { x: number }) => {
    setEndSwipe(false)
    if (data.length === 1) return
    if (imgCount === 1 && position.x < 0) setPositionx(position.x)
    if (imgCount > 1 && imgCount < data.length) setPositionx(position.x)
    if (imgCount === data.length && position.x > 0) setPositionx(position.x)
  }

  const onSwipeEnd = () => {
    if (positionx < -20) setImgCount(imgCount + 1)
    if (positionx > 20) setImgCount(imgCount - 1)
    setPositionx(0)
    setEndSwipe(true)
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

      {data.length > 1 && <Text mt={2}>{data[imgCount - 1].describe}</Text>}

      {data.length > 1 && (
        <ImageCounterWrapper>
          {data.map((_props, index) => (
            <ImageCounter key={index} index={index} imgCount={imgCount} />
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
