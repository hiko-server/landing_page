export interface UpdateUserSettingPayload {
    userID?: string,
    username: string,
    name: Name,
    email: string,
    favPoints: string[]
    [key: string]: any;
}

export interface Name {
    firstName: string
    lastName: string
    displayName: string
    [key: string]: any;
}
