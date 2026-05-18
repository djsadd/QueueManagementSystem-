import { LoginPage } from '../pages/auth/LoginPage'
import { tokenStorage } from '../shared/lib/tokenStorage'

export function AppRouter() {
  const isAuthenticated = Boolean(tokenStorage.getAccessToken())

  if (isAuthenticated) {
    return (
      <main className="app-shell">
        <section className="dashboard-placeholder" aria-label="Панель управления">
          <div>
            <p className="eyebrow">Queue Management System</p>
            <h1>Вход выполнен</h1>
            <p>
              Авторизация подключена. Следующий экран можно развивать как рабочую
              панель оператора или администратора.
            </p>
          </div>
          <button
            className="button button-secondary"
            type="button"
            onClick={() => {
              tokenStorage.clear()
              window.location.reload()
            }}
          >
            Выйти
          </button>
        </section>
      </main>
    )
  }

  return <LoginPage />
}
