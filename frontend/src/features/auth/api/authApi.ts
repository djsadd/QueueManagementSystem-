import { request } from '../../../shared/api/httpClient'
import type {
  AuthTokens,
  LoginCredentials,
  RegisteredUser,
  RegisterCredentials,
} from '../model/types'

export const authApi = {
  login(credentials: LoginCredentials) {
    return request<AuthTokens>('/auth/login', {
      method: 'POST',
      body: credentials,
    })
  },

  register(credentials: RegisterCredentials) {
    return request<RegisteredUser>('/auth/register', {
      method: 'POST',
      body: credentials,
    })
  },
}
