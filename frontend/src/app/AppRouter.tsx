import { LoginPage } from '../pages/auth/LoginPage'
import { DashboardPage } from '../pages/dashboard/DashboardPage'
import { tokenStorage } from '../shared/lib/tokenStorage'

export function AppRouter() {
  const isAuthenticated = Boolean(tokenStorage.getAccessToken())

  if (isAuthenticated) {
    return <DashboardPage />
  }

  return <LoginPage />
}
