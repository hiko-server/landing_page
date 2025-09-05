import { FormEvent, ChangeEvent } from 'react'

export default (cb: any) => {
  return (event: FormEvent<any> & ChangeEvent<HTMLInputElement>) => {
    cb(event.target.value)
  }
}
