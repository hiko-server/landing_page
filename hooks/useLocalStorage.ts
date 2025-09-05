export const getCurrentUserRole = () => {
  if (localStorage.hasOwnProperty('role')) {
    return localStorage.getItem('role') as string
  } else {
    return false
  }
}

export const getCurrentUserInfo = () => {
  if (localStorage.hasOwnProperty('userInfo')) {
    return localStorage.getItem('userInfo')
  } else {
    return false
  }
}
export const getCurrentOrgName = () => {
  if (localStorage.hasOwnProperty('orgName')) {
    return localStorage.getItem('orgName') as string
  } else {
    return false
  }
}
