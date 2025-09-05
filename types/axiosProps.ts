export type headersInterface = {
  headers: {
    'Content-Type': string,
    Authorization?:string
  },
  withCredentials: boolean,
}

export const headers:headersInterface = {
  headers: {
    'Content-Type': 'application/json',
  },
  withCredentials: true,
}