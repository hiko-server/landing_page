// import { useEffect, useState } from 'react'
import CVResult from '../../components/CVViewerPage/CVResult'
// import { CVData } from '../../types/cvProps'
import { exampleCvData } from '../../example/example'
import React from 'react'

const CVPage = () => {
  // const [cvData, setCvData] = useState<CVData>([])
  // useEffect(() => {
  //   setCvData(exampleCvData)
  // }, [])

  return (
    <React.Fragment>
      {exampleCvData !== undefined && (
        <CVResult cvData={exampleCvData} style={{ fontSize: '12px' }} />
      )}
    </React.Fragment>
  )
}
export default CVPage
