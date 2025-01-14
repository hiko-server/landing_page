import React, { VFC } from 'react'
import styled from '@emotion/styled'

const VideoBackgroundLayOut = ({
  children,
}: {
  children: React.ReactNode | null
  style?: React.CSSProperties
}) => {
  return (
    <div className="flex relative w-full h-full">
      <VideoBackground />
      {children}
    </div>
  )
}

export default VideoBackgroundLayOut

export const VideoBackground: VFC = () => {
  const videoSources = [
    '/videos/background.mp4',
    '/videos/background2.mp4',
    '/videos/background3.mp4',
  ]
  const [currentVideoIndex, setCurrentVideoIndex] = React.useState(0)

  const handleVideoEnded = () => {
    setCurrentVideoIndex((prevIndex) => (prevIndex + 1) % videoSources.length)
  }

  return (
    <VideoBackgroundBase>
      <video
        autoPlay
        loop={false}
        muted
        playsInline
        onEnded={handleVideoEnded}
        key={videoSources[currentVideoIndex]}
      >
        <source src={videoSources[currentVideoIndex]} />
      </video>
    </VideoBackgroundBase>
  )
}

const VideoBackgroundBase = styled.div`
  position: absolute;
  top: 0;
  left: 0;
  z-index: -1;
  width: 100%;
  height: 100%;
  overflow: hidden;
  background-color: black; /* Add this line */

  video {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }
`
