import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import loadingLogoUrl from '../../assets/tau_logo_loading_color.gif'
import { authApi } from '../../features/auth/api/authApi'
import { ApiError } from '../../shared/api/httpClient'
import { tokenStorage } from '../../shared/lib/tokenStorage'
import { Button } from '../../shared/ui/Button'
import { TextField } from '../../shared/ui/TextField'

type AuthMode = 'login' | 'register'

type AuthFormState = {
  fullName: string
  email: string
  password: string
}

const initialFormState: AuthFormState = {
  fullName: '',
  email: '',
  password: '',
}

export function LoginPage() {
  const [form, setForm] = useState(initialFormState)
  const [mode, setMode] = useState<AuthMode>('login')
  const [isLoadingPage, setIsLoadingPage] = useState(true)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    const timerId = window.setTimeout(() => setIsLoadingPage(false), 900)

    return () => window.clearTimeout(timerId)
  }, [])

  const isRegisterMode = mode === 'register'

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError('')
    setIsSubmitting(true)

    try {
      if (isRegisterMode) {
        await authApi.register({
          full_name: form.fullName.trim(),
          email: form.email.trim(),
          password: form.password,
        })
      }

      const tokens = await authApi.login({
        email: form.email.trim(),
        password: form.password,
      })

      tokenStorage.setTokens(tokens.access_token, tokens.refresh_token)
      const pathParts = window.location.pathname.split('/').filter(Boolean)
      const shouldStayOnCurrentPath =
        pathParts.includes('admin') || pathParts.includes('operator-display')

      window.location.assign(shouldStayOnCurrentPath ? window.location.pathname : '/admin')
    } catch (caughtError) {
      if (caughtError instanceof ApiError && caughtError.status === 401) {
        setError('Неверная почта или пароль')
      } else if (caughtError instanceof ApiError && caughtError.status === 422) {
        setError('Проверьте правильность заполнения формы')
      } else {
        setError(
          isRegisterMode
            ? 'Не удалось зарегистрировать пользователя'
            : 'Сервис авторизации сейчас недоступен',
        )
      }
    } finally {
      setIsSubmitting(false)
    }
  }

  const switchMode = (nextMode: AuthMode) => {
    setMode(nextMode)
    setError('')
  }

  if (isLoadingPage) {
    return (
      <main className="auth-loader" aria-label="Загрузка">
        <img src={loadingLogoUrl} alt="Загрузка" />
      </main>
    )
  }

  return (
    <main className="login-page">
      <section className="login-card" aria-label="Авторизация">
        <img className="login-logo" src={loadingLogoUrl} alt="Логотип" />

        <div className="login-card-header">
          <h1>{isRegisterMode ? 'Регистрация' : 'Авторизация'}</h1>
        </div>

        <div className="auth-switcher" aria-label="Выбор формы">
          <Button
            className={mode === 'login' ? 'is-active' : ''}
            onClick={() => switchMode('login')}
            type="button"
            variant="secondary"
          >
            Вход
          </Button>
          <Button
            className={mode === 'register' ? 'is-active' : ''}
            onClick={() => switchMode('register')}
            type="button"
            variant="secondary"
          >
            Регистрация
          </Button>
        </div>

        <form className="login-form" onSubmit={handleSubmit}>
          {isRegisterMode ? (
            <TextField
              autoComplete="name"
              label="ФИО"
              name="fullName"
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  fullName: event.target.value,
                }))
              }
              placeholder="Введите ФИО"
              required
              type="text"
              value={form.fullName}
            />
          ) : null}

          <TextField
            autoComplete="email"
            label="Электронная почта"
            name="email"
            onChange={(event) =>
              setForm((current) => ({
                ...current,
                email: event.target.value,
              }))
            }
            placeholder="operator@example.com"
            required
            type="email"
            value={form.email}
          />

          <TextField
            autoComplete={isRegisterMode ? 'new-password' : 'current-password'}
            label="Пароль"
            minLength={6}
            name="password"
            onChange={(event) =>
              setForm((current) => ({
                ...current,
                password: event.target.value,
              }))
            }
            placeholder="Введите пароль"
            required
            type="password"
            value={form.password}
          />

          {error ? <div className="form-alert">{error}</div> : null}

          <Button disabled={isSubmitting} type="submit">
            {isSubmitting
              ? 'Отправка...'
              : isRegisterMode
                ? 'Зарегистрироваться'
                : 'Войти'}
          </Button>
        </form>
      </section>
    </main>
  )
}
