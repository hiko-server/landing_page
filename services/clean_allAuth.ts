import { Cookies } from 'react-cookie'

export async function clean_allAuth() {
  const cookies = new Cookies()
  await cookies.remove('_MATOKEN', { path: '/' })
  await cookies.remove('j0bb8bcae', { path: '/' })
  await cookies.remove('GAIA', { path: '/' })
  //   try{
  //     await localStorage.removeItem('access_token')
  //     await localStorage.removeItem('j0bb8bcae')
  //     await localStorage.removeItem('orgName')
  //   await localStorage.removeItem('userInfo')
  //   // await localStorage.removeItem('markPref')
  //   await localStorage.removeItem('role')
  //   await localStorage.removeItem('gaia_access_token')
  // }catch(e){
  //   console.log(e)
  // }
}

export async function clean_localStorage() {
  localStorage.removeItem("access_token")
  localStorage.removeItem("j0bb8bcae")
  localStorage.removeItem("userInfo")
  localStorage.removeItem("role")
  localStorage.removeItem("orgName")
}
