import { API } from './routing'
// import axios_allow_server_sides from '../services/axios/axiosGetServerSide'
import axios_clinet_sides from '../services/axios/axiosClientSide'



export const list_location = async (
  payload: any
): Promise<any> => {
  return axios_clinet_sides(
    payload
    , API.ASA_LIST_LOCATION,
    "POST")
}
export const list_location_detial = async (
  payload: any
): Promise<any> => {
  return axios_clinet_sides(
    payload
    , API.ASA_LIST_LOCATION,
    "POST")
}


export const create_location = async (
  payload: any,
) => {
  return axios_clinet_sides(
    payload,
    API.ASA_CREATE_LOCATION,
    "POST"
  )
}

export const update_location = async (
  payload: any,
) => {
  return axios_clinet_sides(
    payload,
    API.ASA_UPDATE_LOCATION,
    "PUT"
  )
}
export const delete_location = async (
  payload: any,
) => {
  return axios_clinet_sides(
    payload,
    API.ASA_DETAIL_LOCATION,
    "DELETE"
  )
}