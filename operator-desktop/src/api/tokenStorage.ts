const ACCESS_TOKEN_KEY = 'operatorDesktop.accessToken'
const REFRESH_TOKEN_KEY = 'operatorDesktop.refreshToken'
const EMAIL_KEY = 'operatorDesktop.email'
const USER_KEY = 'operatorDesktop.user'

type StoredUser = {
  id: string
  email: string
  full_name: string
  role: 'ADMIN' | 'OPERATOR' | 'MANAGER'
  is_active: boolean
}

export const tokenStorage = {
  getAccessToken() {
    return localStorage.getItem(ACCESS_TOKEN_KEY)
  },
  getRefreshToken() {
    return localStorage.getItem(REFRESH_TOKEN_KEY)
  },
  setTokens(accessToken: string, refreshToken: string) {
    localStorage.setItem(ACCESS_TOKEN_KEY, accessToken)
    localStorage.setItem(REFRESH_TOKEN_KEY, refreshToken)
  },
  clearTokens() {
    localStorage.removeItem(ACCESS_TOKEN_KEY)
    localStorage.removeItem(REFRESH_TOKEN_KEY)
  },
  getUser(): StoredUser | null {
    const raw = localStorage.getItem(USER_KEY)
    if (!raw) return null

    try {
      const user = JSON.parse(raw) as Partial<StoredUser>
      if (
        typeof user.id === 'string' &&
        typeof user.email === 'string' &&
        typeof user.full_name === 'string' &&
        (user.role === 'ADMIN' || user.role === 'OPERATOR' || user.role === 'MANAGER') &&
        typeof user.is_active === 'boolean'
      ) {
        return user as StoredUser
      }
    } catch {
      return null
    }

    return null
  },
  setUser(user: StoredUser) {
    localStorage.setItem(USER_KEY, JSON.stringify(user))
  },
  clearUser() {
    localStorage.removeItem(USER_KEY)
  },
  getEmail() {
    return localStorage.getItem(EMAIL_KEY) ?? ''
  },
  setEmail(email: string) {
    localStorage.setItem(EMAIL_KEY, email)
  },
  clearEmail() {
    localStorage.removeItem(EMAIL_KEY)
  },
}
