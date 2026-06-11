import { useEffect, useState } from 'react'
import { LoginPage } from '../pages/auth/LoginPage'
import { DashboardPage } from '../pages/dashboard/DashboardPage'
import { OperatorSecondDisplayPage } from '../pages/operator-second-display/OperatorSecondDisplayPage'
import { QueueDisplayPage } from '../pages/queue-display/QueueDisplayPage'
import { authApi } from '../features/auth/api/authApi'
import type { AuthUser } from '../features/auth/model/types'
import { tokenStorage } from '../shared/lib/tokenStorage'

function consumeAuthTokensFromUrl() {
  const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ''))
  const accessToken = hashParams.get('access_token')
  const refreshToken = hashParams.get('refresh_token')

  if (!accessToken || !refreshToken) {
    return
  }

  tokenStorage.setTokens(accessToken, refreshToken)
  hashParams.delete('access_token')
  hashParams.delete('refresh_token')

  const nextHash = hashParams.toString()
  window.history.replaceState(
    null,
    '',
    `${window.location.pathname}${window.location.search}${nextHash ? `#${nextHash}` : ''}`,
  )
}

export function AppRouter() {
  consumeAuthTokensFromUrl()

  const pathParts = window.location.pathname.split('/').filter(Boolean)
  const isAdminPath = pathParts.includes('admin')
  const isOperatorDisplayPath = pathParts.includes('operator-display')
  const isQueueDisplayPath = pathParts.includes('queue-display')
  const requiresStaffAuth = isAdminPath || isOperatorDisplayPath
  const [isCheckingAdmin, setIsCheckingAdmin] = useState(
    () => requiresStaffAuth && tokenStorage.hasTokens(),
  )
  const [staffUser, setStaffUser] = useState<AuthUser | null>(null)

  useEffect(() => {
    if (!requiresStaffAuth) {
      setIsCheckingAdmin(false)
      setStaffUser(null)
      return
    }

    if (!tokenStorage.hasTokens()) {
      setIsCheckingAdmin(false)
      setStaffUser(null)
      return
    }

    let isMounted = true
    setIsCheckingAdmin(true)

    authApi
      .me()
      .then((user) => {
        if (!isMounted) {
          return
        }

        if (user.role === 'ADMIN' || user.role === 'OPERATOR' || user.role === 'MANAGER') {
          setStaffUser(user)
          return
        }

        tokenStorage.clear()
        setStaffUser(null)
      })
      .catch(() => {
        tokenStorage.clear()
        if (isMounted) {
          setStaffUser(null)
        }
      })
      .finally(() => {
        if (isMounted) {
          setIsCheckingAdmin(false)
        }
      })

    return () => {
      isMounted = false
    }
  }, [requiresStaffAuth])

  if (isQueueDisplayPath) {
    return <QueueDisplayPage />
  }

  if (!requiresStaffAuth) {
    return <LoginPage />
  }

  if (isCheckingAdmin) {
    return <main className="auth-loader" aria-label="Загрузка" />
  }

  if (staffUser) {
    if (isOperatorDisplayPath) {
      return <OperatorSecondDisplayPage authUser={staffUser} />
    }

    return <DashboardPage authUser={staffUser} />
  }

  return <LoginPage />
}
