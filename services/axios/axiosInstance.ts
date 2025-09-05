import axios from 'axios'
import { API } from '../../api/routing'
import { toast } from 'react-toastify'


import { Cookies } from 'react-cookie'
import { clean_allAuth } from '../clean_allAuth';
import { getCookie } from 'cookies-next';

const axiosClient = axios.create()

// Replace this with our own backend base URL
axiosClient.defaults.baseURL = process.env.NEXT_PUBLIC_SERVER



// type headers = {
//   'Content-Type': string
//   Accept: string
//   Authorization: string
// }

// axiosClient.defaults.headers = {
//   'Content-Type': 'application/json',
//   Accept: 'application/json',
// } as headers & HeadersDefaults

//create header and config for all API call
axiosClient.interceptors.request.use(
  (config) => {
    config.headers!['Authorization'] = `Bearer ${localStorage.getItem('access_token')}`
    config.withCredentials = true
    return config
  },
  (error) => {
    console.log('error', error)
    return error
  }
)

//refresh token
axiosClient.interceptors.response.use(
  (res) => {
    return res
  },
  async (error) => {
    if (error.response && typeof window !== "undefined") {
      switch (error.response.status) {
        case 401:
          try {
            const originalConfig = error.config
            const cookies = new Cookies()
            originalConfig._retry = true
            console.log(`\n\naxios |err code is 401`)
            const token = getCookie('j0bb8bcae');
            // const { token } = await fetch('/api/refresh-token').then(r => r.json()).catch(err=>console.log(err))
            console.log(`jid rt ${token}\n\n`)
            const payload = { rt: token }
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


            const access = rs.data.data
            // const refresh = rs.data.data['X-Refresh-Token']

            originalConfig.headers.Authorization = `Bearer ${access}`;

            localStorage.setItem('access_token', access)
            cookies.set('_MATOKEN', access, { path: '/' })

            console.log(`renew access token ${access}`)
            return axiosClient(originalConfig)
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
          console.log("interceptors.response 程式發生問題")
          console.log(error.config)
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
)

export default axiosClient
