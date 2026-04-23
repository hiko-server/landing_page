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
  return <StyledBase style={style}>
      {children}
    </StyledBase>
}

const StyledBase = styled.div`
  /* display: flex;
  flex-direction: column; */
  position: relative;
  width: 100%;
  max-width: 1000px;
  margin: 0 auto;
  background-color: #ececec;
  /* Responsive padding: 12px on small screens up to 24px on large */
  padding: clamp(12px, 4vw, 24px);
  min-height: 100vh;
  height: 100%;
`
export default LandingLayout




