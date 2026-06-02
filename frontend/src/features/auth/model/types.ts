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
  id: string
  email: string
  full_name: string
}

export type AuthUser = RegisteredUser & {
  role: 'ADMIN' | 'OPERATOR' | 'MANAGER'
  is_active: boolean
}
