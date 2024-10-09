import { API } from './routing'
import axios_clinet_sides from '../services/axios/axiosClientSide'


export const get_org_list = async (
  payload: any,
) => {
  return axios_clinet_sides(
    payload,
    API.ASA_LIST_ORG,
    "POST"
  )
}

export const create_org_user = async (
  payload: any,
) => {
  return axios_clinet_sides(
    payload,
    API.ASA_INVITE_USER,
    "POST"
  )
}

export const update_org = async (
  payload: any,
) => {
  return axios_clinet_sides(
    payload,
    API.ASA_UPDATE_ORG,
    "PUT"
  )
}