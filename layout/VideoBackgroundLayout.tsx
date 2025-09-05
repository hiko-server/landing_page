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
    '/videos/coding.mp4',
    '/videos/cryptoStock.mp4'
  ]
  const [currentVideoIndex, setCurrentVideoIndex] = React.useState(0)
  const [fade, setFade] = React.useState(false)

  const handleVideoEnded = () => {
    setFade(true)
    setTimeout(() => {
      setCurrentVideoIndex((prevIndex) => (prevIndex + 1) % videoSources.length)
      setFade(false)
    }, 500) // Duration of fade-out effect
  }

  return (
    <VideoBackgroundBase fade={fade}>
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

const VideoBackgroundBase = styled.div<{ fade: boolean }>`
  position: absolute;
  top: 0;
  left: 0;
  z-index: -1;
  width: 100%;
  height: 100%;
  overflow: hidden;
  background-color: black;

  video {
    width: 100%;
    height: 100%;
    object-fit: cover;
    transition: opacity 0.5s ease-in-out;
    opacity: ${({ fade }) => (fade ? 0 : 1)};
  }
`
