import { AxiosRequestConfig } from 'axios'
import axios from 'axios'
// import axios from '../services/axios/axiosInstance'
import { catchAxiosError } from './error'
import { API } from '../api/routing'

const baseConfig: AxiosRequestConfig = {
  // baseURL: API.LOGIN,
  baseURL: API.ASA_LOGIN,
  headers: {
    'Access-Control-Allow-Credentials': true,
  },
  withCredentials: true
}

export const post = (url: string, data: URLSearchParams) => {
  return axios.post(url, data, baseConfig).catch(catchAxiosError)
}

export const get = async (url: string, config: AxiosRequestConfig = {}) => {
  const axiosConfig = {
    ...baseConfig,
    ...config,
  }
  return await axios.get(url, axiosConfig).catch(catchAxiosError)
}
