// import { useEffect, useState } from 'react'

// import { CVData } from '../../types/cvProps'
import CVResult from '../../components/CVViewerPage/CVResult'
import { cvData } from '../../example/cvdata'
import React from 'react'

const CVPage = () => {
  // const [cvData, setCvData] = useState<CVData>([])
  // useEffect(() => {
  //   setCvData(cvData)
  // }, [])

  return (
    <React.Fragment>
      {cvData !== undefined && (
        <CVResult cvData={cvData} style={{ fontSize: '12px' }} />
      )}
    </React.Fragment>
  )
}
export default CVPage
