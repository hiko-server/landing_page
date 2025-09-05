import Router from 'next/router'
import { user_logout } from '../api/user'
import { clean_allAuth, clean_localStorage } from './clean_allAuth'

export async function logout() {
  clean_allAuth()
  user_logout({ rt: localStorage.getItem('j0bb8bcae') }).then((res) => {
    clean_localStorage()
    console.log(res)
  }).catch((e) => {
    console.log(e)
  })

  setTimeout(() => {
    if (Router.asPath != '/session/new') {
      Router.replace(`/session/new`)
    }
  }, 2000)
}
