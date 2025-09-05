// const BACKEND_URL = process.env.NEXT_PUBLIC_SERVER
const ASA_BACKEND_URL = process.env.NEXT_PUBLIC_SERVER
// const ASA_BACKEND_URL = "https://dev-api-asa.eventbinder.app"
export const QRDomain = process.env.NEXT_PUBLIC_QRDOMAIN
// const FILESERVER_URL = process.env.IMAGE_SERVER

export const API = {
  /* TOKEN */
  RENEW_ACCESS_TOKEN: `${ASA_BACKEND_URL}/auth/refresh/at`,

  /*ASA AUTH*/
  ASA_LOGIN: `${ASA_BACKEND_URL}/auth/login`,
  ASA_LOGOUT: `${ASA_BACKEND_URL}/auth/logout`,
  ASA_RESET_PASSWORD_INIT: `${ASA_BACKEND_URL}/reset-password`,
  ASA_RESET_PASSWORD_CALLBACK: `${ASA_BACKEND_URL}/reset-password/callback`,

  /*ASA REFRESH AT*/
  ASA_REFRESH_AT: `${ASA_BACKEND_URL}/auth/refresh/at`,

  /*JOB RELATED */
  ASA_CREATE_JOB: `${ASA_BACKEND_URL}/job/create`,
  ASA_LIST_JOBS: `${ASA_BACKEND_URL}/job/list`,
  ASA_UPDATE_JOBS: `${ASA_BACKEND_URL}/event/update`,
  ASA_DELETE_JOBS: `${ASA_BACKEND_URL}/job`,

  /*ROUTES RELATED */
  ASA_CREATE_ROUTES: `${ASA_BACKEND_URL}/route/create`,
  ASA_LIST_ROUTES: `${ASA_BACKEND_URL}/route/list`,
  ASA_UPDATE_ROUTES: `${ASA_BACKEND_URL}/route/update`,
  ASA_DETAIL_ROUTES: `${ASA_BACKEND_URL}/route`,

  /*ORG RELATED */
  ASA_LIST_ORG: `${ASA_BACKEND_URL}/org/list`,
  ASA_UPDATE_ORG: `${ASA_BACKEND_URL}/org/update`,

  /*LOCATION RELATED */
  ASA_CREATE_LOCATION: `${ASA_BACKEND_URL}/location/create`,
  ASA_LIST_LOCATION: `${ASA_BACKEND_URL}/location/list`,
  ASA_UPDATE_LOCATION: `${ASA_BACKEND_URL}/location/edit`,
  ASA_DETAIL_LOCATION: `${ASA_BACKEND_URL}/location`,

  /*USER RELATED */
  ASA_CREATE_ORG_USER: `${ASA_BACKEND_URL}/user/register`,
  ASA_INVITE_USER: `${ASA_BACKEND_URL}/user/invite`,
  ASA_LIST_USER: `${ASA_BACKEND_URL}/user/list`,
  ASA_UPDATE_USER: `${ASA_BACKEND_URL}/user/update`,
  ASA_DELETE_USER: `${ASA_BACKEND_URL}/user`

}
