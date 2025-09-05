import { createContext, useReducer, Dispatch } from 'react'

// type currentLocation = {
//   lat: number
//   lng: number
// }

interface AppState {
  sidebarCollapsed: boolean
  // sidebarDrawerCollapsed: boolean
  devMode: boolean
  pwaprompt: number
  globalHeadCount: number
  globalInputHeadCount: number
  heartCatering: boolean
  districtID: number
  mapDataRequestURL: string
  currentLat: number
  currentLng: number
  markRefresh: boolean
  markStrokeColor: string
  markStrokeWidth: number
  gradeDisplay: string
  gradeComments: string
  gradeCanvasData: any
  /* cabi */
  navbarHeight: number
  footerHeight: number
  headerHeight: number
}

const initialState: AppState = {
  sidebarCollapsed: true,
  // sidebarDrawerCollapsed: true,
  devMode: false,
  pwaprompt: 1,
  globalHeadCount: 1,
  globalInputHeadCount: 1,
  heartCatering: true,
  districtID: 0,
  mapDataRequestURL: 'http://52.14.224.85:8080/map?d=63',
  currentLat: 0,
  currentLng: 0,
  markRefresh: false,
  markStrokeColor: '#f83b3b',
  markStrokeWidth: 4,
  gradeDisplay: '',
  gradeComments: '',
  gradeCanvasData: {},
  /* cabi */
  navbarHeight: 10,
  footerHeight: 0,
  headerHeight: 0,
}

export const AppContext = createContext<{
  state: AppState
  dispatch: Dispatch<any>
}>({ state: initialState, dispatch: () => {} })

export enum AppActions {
  UPDATE_SIDEBARCOLLAPSED,
  // UPDATE_SIDEBARDRAWERCOLLAPSED,
  UPDATE_HEADCOUNT,
  UPDATE_INPUTHEADCOUNT,
  UPDATE_HEARTCATERING,
  UPDATE_DISTRICTID,
  UPDATE_MAPDATEREQUESTURL,
  UPDATE_GEOLOCATION,
  UPDATE_MARKREFRESH,
  UPDATE_MARKSTROKECOLOR,
  UPDATE_MARKSTROKEWIDTH,
  UPDATE_GRADEDISPLAY,
  UPDATE_GRADECOMMENTS,
  UPDATE_GRADECANVASDATA,
  /* cabi */
  UPDATE_NAVBARHEIGHT,
  UPDATE_FOOTERHEIGHT,
  UPDATE_HEADERHEIGHT,
}

export const MainProvider = ({ children }: { children: React.ReactNode }) => {
  const [state, dispatch] = useReducer((state: AppState, action: any) => {
    switch (action.type) {
      //   case AppActions.UPDATE_SELECTMARKER:
      //     // console.log(action.selectedMarker.geocode.HK1980)
      //     return {
      //       ...state,
      //       selectedMarker: action.selectedMarker,
      //       returnHKdata: action.selectedMarker.geocode.WGS84,
      //       zoom: action.zoom,
      //     };
      case AppActions.UPDATE_SIDEBARCOLLAPSED:
        return {
          ...state,
          sidebarCollapsed: action.sidebarCollapsed,
        }
      // case AppActions.UPDATE_SIDEBARDRAWERCOLLAPSED:
      //   return {
      //     ...state,
      //     sidebarDrawerCollapsed: action.sidebarDrawerCollapsed,
      //   }
      case AppActions.UPDATE_HEADCOUNT:
        return {
          ...state,
          globalHeadCount: action.globalHeadCount,
        }
      case AppActions.UPDATE_INPUTHEADCOUNT:
        return {
          ...state,
          globalInputHeadCount: action.globalInputHeadCount,
        }
      case AppActions.UPDATE_HEARTCATERING:
        return {
          ...state,
          heartCatering: action.heartCatering,
        }
      case AppActions.UPDATE_DISTRICTID:
        return {
          ...state,
          districtID: action.districtID,
        }
      case AppActions.UPDATE_MAPDATEREQUESTURL:
        return {
          ...state,
          mapDataRequestURL: action.mapDataRequestURL,
        }
      case AppActions.UPDATE_GEOLOCATION:
        return {
          ...state,
          currentLat: action.currentLat,
          currentLng: action.currentLng,
        }
      case AppActions.UPDATE_MARKREFRESH:
        return {
          ...state,
          markRefresh: action.markRefresh,
        }
      case AppActions.UPDATE_MARKSTROKECOLOR:
        return {
          ...state,
          markStrokeColor: action.markStrokeColor,
        }
      case AppActions.UPDATE_MARKSTROKEWIDTH:
        return {
          ...state,
          markStrokeWidth: action.markStrokeWidth,
        }
      case AppActions.UPDATE_GRADEDISPLAY:
        return {
          ...state,
          gradeDisplay: action.gradeDisplay,
        }
      case AppActions.UPDATE_GRADECOMMENTS:
        return {
          ...state,
          gradeComments: action.gradeComments,
        }
      case AppActions.UPDATE_GRADECANVASDATA:
        return {
          ...state,
          gradeCanvasData: action.gradeCanvasData,
        }
      /* cabi */
      case AppActions.UPDATE_NAVBARHEIGHT:
        return {
          ...state,
          navbarHeight: action.navbarHeight,
        }
      case AppActions.UPDATE_FOOTERHEIGHT:
        return {
          ...state,
          footerHeight: action.footerHeight,
        }
      case AppActions.UPDATE_HEADERHEIGHT:
        return {
          ...state,
          headerHeight: action.headerHeight,
        }
      default:
        return state
    }
  }, initialState)
  return (
    <AppContext.Provider value={{ state, dispatch }}>
      {children}
    </AppContext.Provider>
  )
}
