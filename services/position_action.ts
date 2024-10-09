import { Dispatch, SetStateAction } from "react"

export enum POSITION_ACTION {
  UP = 'UP',
  DOWN = 'DOWN',
  DELETE = 'DELETE',
  INCREMENT = 'INCREMENT',
}

export const handlePositionChange = (
  setData: Dispatch<SetStateAction<any[]>>,
  index: number,
  direction: POSITION_ACTION,
  defaultData?: any
) => {
  switch (direction) {
    case POSITION_ACTION.UP:
    case POSITION_ACTION.DOWN: {
      setData((prevOptions) => {
        const updatedOptions = [...prevOptions]
        const targetIndex =
          direction === POSITION_ACTION.UP ? index - 1 : index + 1

        if (targetIndex >= 0 && targetIndex < updatedOptions.length) {
          const temp = updatedOptions[index]
          updatedOptions[index] = updatedOptions[targetIndex]
          updatedOptions[targetIndex] = temp
        }
        return updatedOptions
      })
      break
    }
    case POSITION_ACTION.DELETE: {
      setData((prevOptions) => {
        const deleteOptions = [...prevOptions]
        deleteOptions.splice(index, 1)
        return deleteOptions
      })
      break
    }
    case POSITION_ACTION.INCREMENT: {
      setData((prevData) => {
        const newData = [...prevData, defaultData]
        return newData
      })
      break
    }
    default:
      break
  }
}
