import { useEffect, useState } from 'react'
import CVResult from '../../components/CVViewerPage/CVResult'
import CVFormSidebar from '../../components/CVGeneratorPage/SidebarComponent'
import EditLayout from '../../layout/EditLayout'
import { CVData, defaultCVData } from '../../types/cvProps'

const CVGenerator = () => {
  const [cvData, setCvData] = useState<CVData>(defaultCVData)

  useEffect(() => {
    setCvData((_prev) => (_prev = defaultCVData))
  }, [])

  return (
    <EditLayout>
      <CVFormSidebar />
      <CVResult cvData={cvData} />
    </EditLayout>
  )
}
export default CVGenerator
