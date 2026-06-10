const ACCESS_TOKEN_KEY = 'operatorDesktop.accessToken'
const REFRESH_TOKEN_KEY = 'operatorDesktop.refreshToken'
const EMAIL_KEY = 'operatorDesktop.email'

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
