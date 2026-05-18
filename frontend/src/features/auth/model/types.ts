export type LoginCredentials = {
  email: string
  password: string
}

export type RegisterCredentials = LoginCredentials & {
  full_name: string
}

export type AuthTokens = {
  access_token: string
  refresh_token: string
  token_type?: string
}

export type RegisteredUser = {
  id: number
  email: string
  full_name: string
}
