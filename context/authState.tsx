import { createContext, useReducer, Dispatch } from 'react'
// import { UserRoleType yarn} from '../types/Propstypes'

interface AuthAppState {
  accessToken: string
  accessRole: string
  userUUID: string
  userFullName: string
  userAccountName: string
  userOrgUUID: string
  userOrgName: string
}

const initialState: AuthAppState = {
  accessToken: '',
  accessRole: '',
  userUUID: '',
  userFullName: '',
  userAccountName: '',
  userOrgUUID: '',
  userOrgName: '',
}

export const AuthAppContext = createContext<{
  state: AuthAppState
  dispatch: Dispatch<any>
}>({ state: initialState, dispatch: () => {} })

export enum AuthAppActions {
  UPDATE_ACCESSTOKEN,
  UPDATE_ACCESSROLE,
  UPDATE_USERINFO,
}

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [state, dispatch] = useReducer((state: AuthAppState, action: any) => {
    switch (action.type) {
      case AuthAppActions.UPDATE_ACCESSTOKEN:
        return {
          ...state,
          accessToken: action.accessToken,
        }
      case AuthAppActions.UPDATE_ACCESSROLE:
        return {
          ...state,
          accessRole: action.accessRole,
        }
      case AuthAppActions.UPDATE_USERINFO:
        return {
          ...state,
          userUUID: action.userUUID,
          userFullName: action.userFullName,
          userAccountName: action.userAccountName,
          userOrgUUID: action.userOrgUUID,
          userOrgName: action.userOrgName,
        }

      default:
        return state
    }
  }, initialState)
  return (
    <AuthAppContext.Provider value={{ state, dispatch }}>
      {children}
    </AuthAppContext.Provider>
  )
}
