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
  return (
    <VideoBackgroundBase>
      <video autoPlay loop muted playsInline>
        <source src="/videos/background.mp4" />
        
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

  video {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }
`

