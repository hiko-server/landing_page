// import axios, { AxiosRequestConfig } from "axios";
// import Cookie from "js-cookie";
import Router from 'next/router'
// import { LoginInputs } from "../pages/login";
import { catchAxiosError } from './error'
import { post } from './rest_service'
import { AuthToken } from './auth_token'

import { Cookies } from 'react-cookie'

export const COOKIES = {
  authToken: 'token',
}

export const role_classification = (role: string) => {
  console.log(role)
}

export async function login(
  inputs: any
  // isMobileOnlyDevice: boolean
): Promise<string | void> {
  const cookies = new Cookies()
  const data = new URLSearchParams(inputs)
  const res: any = await post('', data).catch(catchAxiosError)

  console.log('res', res)
  if (res.error) {
    return res.error
  }

  console.log('login res', res)

  const access_token = res.data.access_token
  const refresh_token = res.data.refresh_token
  console.log(access_token)

  // // store the token into cookies
  // Cookie.set(COOKIES.authToken, access_token);
  cookies.set('_MATOKEN', access_token, { path: '/' })
  cookies.set('j0bb8bcae', refresh_token, { path: '/' })
  localStorage.setItem('access_token', access_token)
  localStorage.setItem('j0bb8bcae', refresh_token)
  //j0bb8bcae = rt

  // const auth = new AuthToken(access_token)
  let t = new AuthToken(access_token)
  console.log('auth', t)

  localStorage.setItem('role', t.authRole) //admin | user

  localStorage.setItem(
    'userInfo',
    JSON.stringify({
      userAccountName: t.authUserUserName,
      userUUID: t.authUserUserUUID,
      userOrgUUID: t.authUserUserOrgUUID,
      userFullName: t.authUserFullName,
      accessRole: t.authRole,
    }),
  )

  role_classification(t.authRole)
  // if (isMobileOnlyDevice) {
  //   Router.push('/scan')
  // } else {
  //   Router.push('/')
  // }

  // const gaia_access_token = res.data.gaia_access_token
  //   ? res.data.gaia_access_token
  //   : undefined
  // console.log('gaia_access_token', gaia_access_token)

  // // store the token into cookies
  // Cookie.set(COOKIES.authToken, access_token);
  // cookies.set('GAIA', gaia_access_token, { path: '/' })
  // localStorage.setItem('gaia_access_token', gaia_access_token)

  let destination = ''

  switch (t.authRole) {
    // case ASAIdentity.ADMIN: {
    //   console.log("server side | will route to the index page")
    //   destination = '/'
    //   break
    // }

    // case ASAIdentity.USER: {
    //   console.log("is user | server side | will route to the index page")
    //   destination = '/'
    //   break
    // }

    default: {
      console.log("will route to the home page")
      destination = '/cv'
      break
    }
  }

  await Router.push(destination)


  // if (auth.authRole == 'S') {
  //   await Router.push('/scan')
  // } else {
  //   await Router.push('/')
  // }
}
