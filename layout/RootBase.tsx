import React from 'react'
// import styled from '@emotion/styled'
import styled from '@emotion/styled'

const RootBaseLayout = ({
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
  /* max-width: 414px; */
  background-color: rgb(204,204,204);

  width: 100%;
  height: 100%;
  margin: auto;
`
export default RootBaseLayout
