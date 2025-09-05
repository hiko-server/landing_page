import styled from '@emotion/styled'

export const Container = styled.div`
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
`

export const PostImage = styled.div`
  width: 300px;
  height: 300px;
  position: relative;
  overflow: hidden;
`

type ImgDivProps = {
  imgCount: number
  positionx: number
  endSwipe: boolean
}

export const ImgDiv = styled.div<ImgDivProps>`
  display: flex;
  width: 100%;
  height: 100%;
  transition: transform ${({ endSwipe }) => (endSwipe ? '0.2s' : '0s')};
  transform: translateX(
    ${({ imgCount, positionx }) =>
      `calc(${positionx}px + ${-100 * (imgCount - 1)}%)`}
  );
`

export const Img = styled.img`
  width: 100%;
  height: 100%;
  object-fit: cover;
`

type ImageCounterProps = {
  imgCount: number
  index: number
}

export const ImageCounter = styled.div<ImageCounterProps>`
  width: 6px;
  height: 6px;
  background: ${({ index, imgCount }) =>
    index === imgCount - 1 ? '#0095f6' : '#a8a8a8'};
  border-radius: 50%;
  &:not(:last-of-type) {
    margin-right: 4px;
  }
`

export const ImageCounterWrapper = styled.div`
  display: flex;
  justify-content: center;
  align-items: center;
  margin-bottom: 15px;
  margin-top: 15px;
`
