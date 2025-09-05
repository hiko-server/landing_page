export interface QueryRouteList {
    displayName: string
    locationID: string
}

export interface UpdateRouteList {
    locationID: string
    [key: string]: any;
}
  export interface RouteDetail {
    name: string
    description: string
    routeOrder: QueryRouteList[]
    [key: string]: any;
  }
  