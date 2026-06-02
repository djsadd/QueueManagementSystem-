import { request } from '../../../shared/api/httpClient'
import type {
  AuthTokens,
  AuthUser,
  LoginCredentials,
  RegisteredUser,
  RegisterCredentials,
} from '../model/types'

export const authApi = {
  login(credentials: LoginCredentials) {
    return request<AuthTokens>('/auth/login', {
      method: 'POST',
      body: credentials,
      skipAuthRefresh: true,
    })
  },

  register(credentials: RegisterCredentials) {
    return request<RegisteredUser>('/auth/register', {
      method: 'POST',
      body: credentials,
    })
  },

  me() {
    return request<AuthUser>('/auth/me')
  },
}
