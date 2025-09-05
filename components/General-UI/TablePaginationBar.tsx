import React, { useEffect, useState } from 'react'

import {
  Text,
  Flex,
  Button,
  Select,
  Editable,
  EditablePreview,
  EditableInput,
} from '@chakra-ui/react'

import { ChevronLeft, ChevronRight } from '@mui/icons-material'

const TablePaginationBar = ({ instance }: { instance: any }) => {
  const [pageString, setPageString] = useState('')

  useEffect(() => {
    setPageString(instance.getState().pagination.pageIndex + 1)

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [instance.getState().pagination.pageIndex])

  return (
    <Flex
      direction={'row'}
      justifyContent={'flex-end'}
      alignContent={'center'}
      // marginTop={'10px'}
      // bgColor={'#ffcfa5'}
      // pl={'20px'}
      // py={'10px'}
    >
      <Flex
        alignItems={'center'}
        // bgColor={'#bcff57'}
      >
        <Select
          w={'70px'}
          value={instance.getState().pagination.pageSize}
          onChange={(e) => {
            instance.setPageSize(Number(e.target.value))
          }}
          borderColor={'red'}
          // bgColor={'#bc6bff'}
        >
          {[10, 20, 30, 40, 50].map((pageSize) => (
            <option key={pageSize} value={pageSize}>
              {pageSize}
            </option>
          ))}
        </Select>
        <Flex flex={1} mx={'10px'}>
          <Text>items / page</Text>
        </Flex>
        {/* <Button
        variant={'ghost'}
        shadow={'none'}
        fontSize={'xl'}
        onClick={() => instance.setPageIndex(0)}
        disabled={!instance.getCanPreviousPage()}
      >
        &lt;&lt;
      </Button> */}
      </Flex>
      <Flex
        alignItems={'center'}
        // bgColor="#86f1ff"
      >
        <Button
          variant={'ghost'}
          shadow={'none'}
          fontSize={'xl'}
          onClick={() => instance.previousPage()}
          disabled={!instance.getCanPreviousPage()}
          mr={'-10px'}
        >
          <ChevronLeft />
        </Button>
        <Editable
          borderRadius={'4px'}
          borderWidth={'1px'}
          borderColor={'red'}
          // boxSize={'24px'}
          // marginTop={'-2px'}
          marginRight={'5px'}
          // margin={'5px'}
          textAlign={'center'}
          value={pageString}
          defaultValue={instance.getState().pagination.pageIndex + 1}
          onChange={(e) => setPageString(e)}
          onSubmit={(e) => {
            if (parseInt(e) >= 1 && parseInt(e) <= instance.getPageCount()) {
              instance.setPageIndex(parseInt(e) - 1)
            } else {
              setPageString(instance.getState().pagination.pageIndex + 1)
            }
          }}
        >
          <EditablePreview width={'24px'} />
          <EditableInput />
        </Editable>
        <Text>/ {instance.getPageCount()}</Text>
        <Button
          variant={'ghost'}
          shadow={'none'}
          fontSize={'xl'}
          onClick={() => instance.nextPage()}
          disabled={!instance.getCanNextPage()}
          ml={'-10px'}
        >
          <ChevronRight />
        </Button>
        {/* <Button
        variant={'ghost'}
        shadow={'none'}
        fontSize={'xl'}
        onClick={() => instance.setPageIndex(instance.getPageCount() - 1)}
        disabled={!instance.getCanNextPage()}
      >
        &gt;&gt;
      </Button> */}
      </Flex>
      <Flex
        alignItems={'center'}
        pl={'20px'}
        // bgColor={'#ae7e54'}
      >
        {/* py={'8px'} w={'30%'} */}
        <Text>
          Result:{' '}
          {instance.getState().pagination.pageIndex *
            instance.getState().pagination.pageSize +
            1}
          {'-'}
          {(instance.getState().pagination.pageIndex + 1) *
            instance.getState().pagination.pageSize <
          instance.getPrePaginationRowModel().rows.length
            ? (instance.getState().pagination.pageIndex + 1) *
              instance.getState().pagination.pageSize
            : instance.getPrePaginationRowModel().rows.length}
          {' of '}
          {instance.getPrePaginationRowModel().rows.length}
        </Text>
      </Flex>
    </Flex>
  )
}

export default TablePaginationBar
