import { API } from './routing'
// import axios_allow_server_sides from '../services/axios/axiosGetServerSide'
import axios_clinet_sides from '../services/axios/axiosClientSide'



export const list_routes = async (
    payload: any
): Promise<any> => {
    return axios_clinet_sides(
        payload
        , API.ASA_LIST_ROUTES,
        "POST")
}

export const get_route_detail = async (
    payload: any
): Promise<any> => {
    return axios_clinet_sides(
        payload
        , API.ASA_LIST_ROUTES,
        "POST")
}


export const update_route = async (
    payload: any,
): Promise<any> => {
    return axios_clinet_sides(
        payload,
        API.ASA_UPDATE_ROUTES,
        "PUT"
    )
}
export const create_route = async (
    payload: any,
) => {
    return axios_clinet_sides(
        payload,
        API.ASA_CREATE_ROUTES,
        "POST"
    )
}