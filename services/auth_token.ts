import jwtDecode from 'jwt-decode'

export type DecodedToken = {
  readonly sub: string
  readonly username: string
  readonly uid: string
  readonly oid: string
  readonly fullname: string
  readonly iat: number
  readonly exp: number
}

export class AuthToken {
  readonly decodedToken: DecodedToken

  constructor(readonly token?: string) {
    this.decodedToken = {
      sub: '',
      username: '',
      uid: '',
      oid: '',
      fullname: '',
      iat: 0,
      exp: 0,
    }
    try {
      if (token) this.decodedToken = jwtDecode(token)
    } catch (e) {}
  }

  get authorizationString() {
    return `Bearer ${this.token}`
  }

  get authRole() {
    return this.decodedToken.sub
  }

  get authUserUserName() {
    return this.decodedToken.username
  }

  get authUserUserUUID() {
    return this.decodedToken.uid
  }

  get authUserUserOrgUUID() {
    return this.decodedToken.oid
  }

  get authUserFullName() {
    return this.decodedToken.fullname
  }

  get expiresAt(): Date {
    return new Date(this.decodedToken.exp * 1000)
  }

  get isExpired(): boolean {
    return new Date() > this.expiresAt
  }

  get isAuthenticated(): boolean {
    return !this.isExpired
  }
}
