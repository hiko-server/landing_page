import axios, { AxiosResponse } from "axios"
import { toast } from "react-toastify"
import { API } from "../../api/routing"
import { headers } from "../../types/axiosProps"
import { clean_allAuth } from "../clean_allAuth"
import axiosClient from "./axiosInstance"
import checkIsAuth from "../../helpers/checkIsAuth"

const axios_server_side = async (
  response: Promise<AxiosResponse<any, any>>,
  refresh_token: string
) => {
  try {
    console.log('response', response)
    const res = await response
    return res.data
  } catch (error: any) {
    if (error.response) {
      switch (error.response.status) {
        case 401:
          try {
            const originalConfig = error.config

            const payload = { rt: refresh_token }
            console.log(`payload | ${JSON.stringify(payload)}`)

            const header = {
              'Content-Type': 'application/json',
              accept: 'application/json',
            }


            console.log('\n\nuse axios method get new access token\n\n\n')
            const isServer = typeof window === "undefined"
            console.log(`\n\n>>>>      isServer ${isServer}      <<<<\n\n`)
            const rs = await axios.post(API.RENEW_ACCESS_TOKEN, payload,
              {
                headers: header
              }
            )

            // console.log(`renew access token ${Object.keys(rs.data.data)} ${JSON.stringify(rs.data)}`)

            const access = rs.data.data
            // const refresh = rs.data.data['X-Refresh-Token']

            originalConfig.headers.Authorization = `Bearer ${access}`;

            return axios(originalConfig)
          } catch (_error) {
            toast.error('Session time out. Please login again.', {
              position: 'bottom-center',
              hideProgressBar: false,
              closeOnClick: true,
              pauseOnHover: true,
              draggable: true,
              progress: 0,
            })

            // Logging out the user by removing all the tokens from local
            // localStorage.removeItem('access_token')
            // localStorage.removeItem('j0bb8bcae')
            clean_allAuth()
            // Redirecting the user to the landing page
            window.location.href = window.location.origin
            return Promise.reject(_error)
          }

        case 404:
          console.log("你要找的頁面不存在")
          // go to 404 page
          break
        case 500:
          console.log("server_side 程式發生問題")
          // go to 500 page
          break
      }
    }

    if (!window.navigator.onLine) {
      alert("網路出了點問題，請重新連線後重整網頁");
      return;
    }
    return Promise.reject(error);




  }
}

const axios_allow_server_sides = async (
  payload: any,
  url: string,
  access_token?: string,
  refresh_token?: string,
) => {
  let successObject: { success: boolean; data: any } | undefined = undefined
  let errorObject: { success: boolean; error: { description: any; status: string } } | undefined = undefined
  try {
    const config = headers
    config.headers['Authorization'] = access_token
    let response
    if (refresh_token && access_token){ 
       response = await axios_server_side(axios.post(url, payload), refresh_token)
    } else {
      checkIsAuth ()
       response = await axiosClient.post(url, payload)}
    

    successObject = {
      success: true,
      data: response.data
    }
  } catch (e: any) {
    if (e.response?.data?.statusCode == 400){
    successObject = {
      success: true,
      data: []
    }} else {
    errorObject = {
      success: false,
      error: {
        description: e.response?.data?.message ?? e.message,
        status:
          e.response?.data?.statusCode == 400 ? 'info' : 'error',
      }
    }
  }
  }
  finally {
    return new Promise((resolve, reject) => {
      if (successObject) resolve(successObject)
      else reject(errorObject)
    })
  }
}
export default axios_allow_server_sides


