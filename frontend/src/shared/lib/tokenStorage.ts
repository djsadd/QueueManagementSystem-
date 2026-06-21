const ACCESS_TOKEN_KEY = 'qms_access_token'
const REFRESH_TOKEN_KEY = 'qms_refresh_token'
const USER_KEY = 'qms_staff_user'

type StoredStaffUser = {
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

  hasTokens() {
    return Boolean(localStorage.getItem(ACCESS_TOKEN_KEY) || localStorage.getItem(REFRESH_TOKEN_KEY))
  },

  setTokens(accessToken: string, refreshToken: string) {
    localStorage.setItem(ACCESS_TOKEN_KEY, accessToken)
    localStorage.setItem(REFRESH_TOKEN_KEY, refreshToken)
  },

  clear() {
    localStorage.removeItem(ACCESS_TOKEN_KEY)
    localStorage.removeItem(REFRESH_TOKEN_KEY)
    localStorage.removeItem(USER_KEY)
  },

  getUser(): StoredStaffUser | null {
    const raw = localStorage.getItem(USER_KEY)
    if (!raw) return null

    try {
      const user = JSON.parse(raw) as Partial<StoredStaffUser>
      if (
        typeof user.id === 'string' &&
        typeof user.email === 'string' &&
        typeof user.full_name === 'string' &&
        (user.role === 'ADMIN' || user.role === 'OPERATOR' || user.role === 'MANAGER') &&
        typeof user.is_active === 'boolean'
      ) {
        return user as StoredStaffUser
      }
    } catch {
      return null
    }

    return null
  },

  setUser(user: StoredStaffUser) {
    localStorage.setItem(USER_KEY, JSON.stringify(user))
  },

  clearUser() {
    localStorage.removeItem(USER_KEY)
  },
}
