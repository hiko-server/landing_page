import Router from 'next/router'
import { Cookies } from 'react-cookie'
import { AuthToken } from '../services/auth_token'
import { clean_allAuth, clean_localStorage } from '../services/clean_allAuth'
// import { logout } from '../services/logout_service'

/* environment variable */
// const productionMode = process.env.NEXT_PUBLIC_PRODUCTION_MODE

export default function checkIsAuth(auth = true) {
  if (auth != undefined && !auth) {
    if (Router.asPath != '/session/reset') {
      clean_allAuth()
      clean_localStorage()
      Router.replace('/session/new')
    }
  }
  const cookies = new Cookies()
  if (cookies.get('_MATOKEN') == undefined) {
    if (Router.asPath != '/session/reset') {
      clean_allAuth()
      clean_localStorage()
      Router.replace('/session/new')
    }
  } else {
    const auth = new AuthToken(cookies.get('_MATOKEN'))
    if (auth.authUserUserName == '') {
      if (Router.asPath != '/session/reset') {
        clean_allAuth()
        clean_localStorage()
        Router.replace('/session/new')
      }
    }
  }

  if (!localStorage.hasOwnProperty('access_token')) {
    if (Router.asPath != '/session/reset') {
      clean_allAuth()
      clean_localStorage()
      Router.replace('/session/new')
    }
  }
}
