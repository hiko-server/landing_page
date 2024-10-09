import { createContext, useReducer, Dispatch } from 'react'

interface SettingsAppState {
  isPortraitLayout: boolean
  hideForm: boolean
}

const initialState: SettingsAppState = {
  isPortraitLayout: false,
  hideForm: false,
}

export const SettingsAppContext = createContext<{
  state: SettingsAppState
  dispatch: Dispatch<any>
}>({ state: initialState, dispatch: () => {} })

export enum SettingsAppActions {
  UPDATE_LAYOUTDIRECTION,
  UPDATE_HIDEFORM,
}

export const SettingsAppProvider = ({
  children,
}: {
  children: React.ReactNode
}) => {
  const [state, dispatch] = useReducer(
    (state: SettingsAppState, action: any) => {
      switch (action.type) {
        case SettingsAppActions.UPDATE_LAYOUTDIRECTION:
          return {
            ...state,
            isPortraitLayout: action.isPortraitLayout,
          }
        case SettingsAppActions.UPDATE_HIDEFORM:
          return {
            ...state,
            hideForm: action.hideForm,
          }
        default:
          return state
      }
    },
    initialState,
  )
  return (
    <SettingsAppContext.Provider value={{ state, dispatch }}>
      {children}
    </SettingsAppContext.Provider>
  )
}
