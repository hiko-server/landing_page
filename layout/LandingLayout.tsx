import React from 'react'
// import styled from '@emotion/styled'
import styled from '@emotion/styled'

const LandingLayout = ({
  //   forceMobileOnly,
  children,
  style,
}: {
  //   forceMobileOnly?: boolean
  children: React.ReactNode | null
  style?: React.CSSProperties
}) => {
  return (
    <StyledBase
      //   style={style && forceMobileOnly ? 'max-width: 414px !important' : '100%'}
      style={style}
      //   SforceMobileOnly={forceMobileOnly != undefined ? forceMobileOnly : false}
    >
      {children}
    </StyledBase>
  )
}

const StyledBase = styled.div`
  /* display: flex;
  flex-direction: column; */
  /* max-width: 414px !important; */
  position: relative;
  min-width: 414px;
  max-width: 1000px;
  background-color: #ececec;
  padding: 20px;

  width: 100%;
  min-height: 100vh;
  height: 100%;
  margin: auto;
`
export default LandingLayout
