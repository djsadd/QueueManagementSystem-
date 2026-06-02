import { useEffect, useState } from 'react'
import { LoginPage } from '../pages/auth/LoginPage'
import { DashboardPage } from '../pages/dashboard/DashboardPage'
import { PublicTicketPage } from '../pages/public-ticket/PublicTicketPage'
import { QueueDisplayPage } from '../pages/queue-display/QueueDisplayPage'
import { authApi } from '../features/auth/api/authApi'
import type { AuthUser } from '../features/auth/model/types'
import { tokenStorage } from '../shared/lib/tokenStorage'

export function AppRouter() {
  const pathParts = window.location.pathname.split('/').filter(Boolean)
  const isAdminPath = pathParts.includes('admin')
  const isQueueDisplayPath = pathParts.includes('queue-display')
  const [isCheckingAdmin, setIsCheckingAdmin] = useState(
    () => isAdminPath && tokenStorage.hasTokens(),
  )
  const [staffUser, setStaffUser] = useState<AuthUser | null>(null)

  useEffect(() => {
    if (!isAdminPath) {
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
  }, [isAdminPath])

  if (isQueueDisplayPath) {
    return <QueueDisplayPage />
  }

  if (!isAdminPath) {
    return <PublicTicketPage />
  }

  if (isCheckingAdmin) {
    return <main className="auth-loader" aria-label="Загрузка" />
  }

  if (staffUser) {
    return <DashboardPage authUser={staffUser} />
  }

  return <LoginPage />
}
