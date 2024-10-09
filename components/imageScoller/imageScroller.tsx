import { Button, Container, Img, Text } from '@chakra-ui/react'
import { useState } from 'react'
import Swipe from 'react-easy-swipe'
import {
  PostImage,
  ImgDiv,
  ImageCounterWrapper,
  ImageCounter,
} from './imageScrollerStyle'

const postData = {
  boardImageUrl: [
    'https://theinsatiabletraveler.com/wp-content/uploads/2015/08/Cape-Point-Day-Trip-7117.jpg',
    'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcQiNB3Z62gMn49v5t49v-cRlLXxlmy0kA-ihQ&s',
  ],
}

const ImageScroller = () => {
  const [positionx, setPositionx] = useState<number>(0)
  const [imgCount, setImgCount] = useState<number>(1)
  const [endSwipe, setEndSwipe] = useState<boolean>(false)

  const onSwipeMove = (position: { x: number }) => {
    setEndSwipe(false)
    if (postData.boardImageUrl.length === 1) {
      return
    }
    if (imgCount === 1 && position.x < 0) {
      setPositionx(() => position.x)
      return
    }
    if (imgCount > 1 && imgCount < postData.boardImageUrl.length) {
      setPositionx(() => position.x)
      return
    }
    if (imgCount === postData.boardImageUrl.length && position.x > 0) {
      setPositionx(() => position.x)
      return
    }
  }

  const onSwipeEnd = () => {
    if (positionx < -20) {
      setImgCount((imgCount) => imgCount + 1)
    }
    if (positionx > 20) {
      setImgCount((imgCount) => imgCount - 1)
    }
    setPositionx(() => 0)
    setEndSwipe(true)
  }
  const handleNextClick = () => {
    if (imgCount > 0 && imgCount < postData.boardImageUrl.length) {
      setImgCount((imgCount) => imgCount + 1)
    }
    console.log(imgCount)
    console.log(positionx)
  }

  const handlePrevClick = () => {
    if (imgCount > 1 && imgCount <= postData.boardImageUrl.length) {
      setImgCount((imgCount) => imgCount - 1)
    }
    console.log(imgCount)
    console.log(positionx)
  }

  return (
    <Container>
      <PostImage>
        <Swipe onSwipeEnd={onSwipeEnd} onSwipeMove={onSwipeMove}>
          <ImgDiv imgCount={imgCount} positionx={positionx} endSwipe={endSwipe}>
            {postData.boardImageUrl.map((imageUrl, index) => (
              <Img key={index} src={imageUrl} alt={`Image ${index}`} />
            ))}
          </ImgDiv>
        </Swipe>
      </PostImage>
      <Button onClick={handlePrevClick}>
        <Text>Previous</Text>
      </Button>
      <Button onClick={handleNextClick}>
        <Text>Next</Text>
      </Button>

      {postData.boardImageUrl.length > 1 && (
        <ImageCounterWrapper>
          {postData.boardImageUrl.map((_props, index) => (
            <ImageCounter key={index} index={index} imgCount={imgCount} />
          ))}
        </ImageCounterWrapper>
      )}
    </Container>
  )
}

export default ImageScroller
