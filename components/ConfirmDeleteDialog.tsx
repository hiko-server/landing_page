import React, { useState } from 'react'
import {
    Flex,
    Button,
    Input,
    Text,
    Tag,
    AlertDialog,
    AlertDialogBody,
    AlertDialogCloseButton,
    AlertDialogContent,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogOverlay,
} from '@chakra-ui/react'
import 'react-datepicker/dist/react-datepicker.css'
import { cabiaiColor } from '../theme/color'

const ConfirmDeleteDialog = ({
    isOpen,
    onClose,
    type,
    name,
    uuid,

    //   setFetchNewData,
    // postData,
    //   setDisplayConfirmDeleteDialog,
    setIsGoing2Delete,
}: {
    isOpen: boolean
    onClose: () => void
    type?: string
    name: string
    uuid: string

    // postData: { name: string; userUUID: string }
    //   setFetchNewData?: React.Dispatch<React.SetStateAction<boolean>>
    //   setDisplayConfirmDeleteDialog: React.Dispatch<React.SetStateAction<boolean>>
    setIsGoing2Delete: React.Dispatch<React.SetStateAction<boolean>>
}) => {
    //   const toast = useToast()
    const [deleteInput, setDeleteInput] = useState('')
    // const router = useRouter()

    const cancelRef = React.useRef(null)
    // const [data, setData] = useState<{ name: string; userUUID: string }>(postData)

    // console.log('postData in Dialog', postData)

    return (
        <React.Fragment>
            <AlertDialog
                motionPreset="slideInBottom"
                leastDestructiveRef={cancelRef}
                onClose={onClose}
                isOpen={isOpen}
                isCentered
            >
                <AlertDialogOverlay />
                <AlertDialogContent>
                    <AlertDialogHeader>Delete {type ? type : ''}</AlertDialogHeader>
                    <AlertDialogCloseButton />
                    <AlertDialogBody>
                        <Flex direction={'column'} gap="20px">
                            <Text color={cabiaiColor.grey.strong}>
                                Are you absolutely sure you want to delete{' '}
                                <Tag color="black">{name}</Tag> ?
                            </Text>

                            <Text color={'black'}>
                                Enter the following to confirm:
                                <Tag>{uuid}</Tag>
                            </Text>

                            <Input
                                value={deleteInput}
                                onChange={(e) => {
                                    setDeleteInput(e.target.value)
                                }}
                            />
                        </Flex>
                    </AlertDialogBody>
                    <AlertDialogFooter>
                        <Flex direction={'row'} gap="10px">
                            <Button
                                colorScheme={deleteInput != uuid ? '' : 'red'}
                                disabled={deleteInput != uuid}
                                onClick={() => {
                                    setIsGoing2Delete((_prev) => (_prev = true))
                                    //   let postData = {
                                    //     userUUID: uuid,
                                    //   }
                                    //   console.log('postdata:', postData)
                                    //   delete_location
                                }}
                            >
                                Delete
                            </Button>
                            <Button ref={cancelRef} onClick={onClose}>
                                Cancel
                            </Button>
                        </Flex>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </React.Fragment>
    )
}

export default ConfirmDeleteDialog
