const apiBaseUrl = process.env.NEXT_PUBLIC_SERVER;





export const get_user_detail = async (
  payload: any
): Promise<any> => {
  return axios_clinet_sides(
    payload
    , API.ASA_LIST_USER,
    "POST")
}


export const login = async (username: string, password: string) => {
  const resp = await fetch(`${apiBaseUrl}/api/user/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  });
  return resp.json();
};

export const getUserInfo = async (token: string) => {
  const resp = await fetch(`${apiBaseUrl}/api/user/info`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
  return resp.json();
};

export const getUserForProfile = async (token: string | null) => {
  const resp = await fetch(
    `${process.env.NEXT_PUBLIC_SERVER}/api/user/profile_info`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    })
  return resp.json()
}

export const editProfile = async (
  firstName: string,
  surName: string,
  alternateName: string | null,
  emailAddress: string,
  token: string | null
) => {
  const resp = await fetch(`${apiBaseUrl}/api/user/update_userprofile`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ firstName, surName, alternateName, emailAddress }),
  });
  return resp.json();
};

export const editPassword = async (
  currentPassword: string, newPassword: string, confirmNewPassword: string, token: string | null
) => {
  const resp = await fetch(`${apiBaseUrl}/api/user/update_password`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ currentPassword, newPassword, confirmNewPassword }),
  });
  return resp.json();
};

import axios_clinet_sides from '../services/axios/axiosClientSide'
// import axios_allow_server_sides from '../services/axios/axiosGetServerSide'
import { API } from './routing'

export const list_all_user = async (
  payload: any,
) => {
  return axios_clinet_sides(
    payload,
    API.ASA_LIST_USER,
    "POST"
  )
}

export const update_user = async (
  payload: any,
) => {
  return axios_clinet_sides(
    payload,
    API.ASA_UPDATE_USER,
    "PUT"
  )
}

// export const get_user_detail = async (
//   payload: any,
//   access_token?: string,
//   refresh_token?: string
// ) => {
//   return axios_allow_server_sides(
//     payload,
//     API.ASA_GET_USER_DETAIL,
//     access_token, refresh_token
//   )
// }

export const user_logout = async (
  payload: any,
) => {
  return axios_clinet_sides(
    payload,
    API.ASA_LOGOUT,
    "POST"
  )
}
export const user_delete = async (
  payload: any,
) => {
  return axios_clinet_sides(
    payload,
    API.ASA_DELETE_USER,
    "DELETE"
  )
}

// export const list_sessions = async (
// ) => {
//   return axios_clinet_sides(
//     {},
//     API.ASA_LIST_SESSIONS,
//     "GET"
//   )
// }