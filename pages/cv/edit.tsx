import { Flex } from '@chakra-ui/react'
import HeaderFooter from '../../layout/HeaderFooter'
import CustomHead from '../../components/General-UI/CustomHead'
import CVEditor from '../../components/Admin/CVEditor'

export default function CVEditorPage() {
  const [isMobile] = [false]
  return (
    <>
      <CustomHead title="Edit CV" description="Edit CV data in EN/ZH and sync structure" />
      <HeaderFooter isMobile={isMobile}>
        <Flex direction="column" gap={4} p={6}>
          <CVEditor />
        </Flex>
      </HeaderFooter>
    </>
  )
}
