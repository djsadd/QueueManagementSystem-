import { useEffect, useMemo, useState } from 'react'
import { tokenStorage } from '../../shared/lib/tokenStorage'
import './dashboard-page.css'

type Lang = 'ru' | 'kk' | 'en'

const LANG_STORAGE_KEY = 'queueflow-language'
const languages = ['ru', 'kk', 'en'] as const

function isLang(value: string | undefined): value is Lang {
  return languages.includes(value as Lang)
}

function getInitialLang(): Lang {
  const pathLang = window.location.pathname.split('/').filter(Boolean)[0]

  if (pathLang === 'kz') {
    return 'kk'
  }

  if (isLang(pathLang)) {
    return pathLang
  }

  const savedLang = localStorage.getItem(LANG_STORAGE_KEY) ?? undefined

  return isLang(savedLang) ? savedLang : 'ru'
}

function buildLocalizedPath(lang: Lang) {
  const pathParts = window.location.pathname.split('/').filter(Boolean)
  const hasLangPrefix = isLang(pathParts[0]) || pathParts[0] === 'kz'
  const restParts = hasLangPrefix ? pathParts.slice(1) : pathParts
  const restPath = restParts.length > 0 ? `/${restParts.join('/')}` : ''

  return `/${lang}${restPath}${window.location.search}${window.location.hash}`
}

const labels = {
  ru: {
    appName: 'QueueFlow',
    appSubtitle: 'AI управление очередью',
    title: 'Управление очередью',
    subtitle: 'Мониторинг очереди и клиентов в реальном времени',
    live: 'В эфире',
    customersWaiting: 'Клиентов ожидают',
    avgWait: 'Среднее ожидание',
    serviceDesks: 'Доступные окна',
    good: 'Хорошо',
    active: 'Активно',
    addCustomer: 'Добавить клиента',
    aiBalancer: 'AI балансировщик',
    queueTitle: 'Очередь в реальном времени',
    token: 'Талон',
    customer: 'Клиент',
    serviceType: 'Тип услуги',
    assignedDesk: 'Окно',
    priority: 'Приоритет',
    waitTime: 'Ожидание',
    status: 'Статус',
    normal: 'Обычный',
    urgent: 'Срочно',
    emergency: 'Экстренно',
    consultation: 'На приеме',
    waiting: 'Ожидает',
    admin: 'Администратор',
    role: 'Системный администратор',
    logout: 'Выйти',
    years: 'лет',
    min: 'мин',
    menu: [
      'Панель',
      'Регистрация клиента',
      'Окна обслуживания',
      'Экран очереди',
      'AI балансировщик',
      'Аналитика',
      'Настройки',
    ],
  },
  kk: {
    appName: 'QueueFlow',
    appSubtitle: 'AI кезек басқару',
    title: 'Кезекті басқару',
    subtitle: 'Кезек пен клиенттерді нақты уақытта бақылау',
    live: 'Тікелей',
    customersWaiting: 'Күтіп тұрған клиенттер',
    avgWait: 'Орташа күту',
    serviceDesks: 'Қолжетімді терезелер',
    good: 'Жақсы',
    active: 'Белсенді',
    addCustomer: 'Клиент қосу',
    aiBalancer: 'AI теңгерімші',
    queueTitle: 'Нақты уақыттағы кезек',
    token: 'Талон',
    customer: 'Клиент',
    serviceType: 'Қызмет түрі',
    assignedDesk: 'Терезе',
    priority: 'Басымдық',
    waitTime: 'Күту',
    status: 'Күйі',
    normal: 'Қалыпты',
    urgent: 'Шұғыл',
    emergency: 'Өте шұғыл',
    consultation: 'Қабылдауда',
    waiting: 'Күтуде',
    admin: 'Әкімші',
    role: 'Жүйе әкімшісі',
    logout: 'Шығу',
    years: 'жас',
    min: 'мин',
    menu: [
      'Панель',
      'Клиент тіркеу',
      'Қызмет терезелері',
      'Кезек экраны',
      'AI теңгерімші',
      'Аналитика',
      'Баптаулар',
    ],
  },
  en: {
    appName: 'QueueFlow',
    appSubtitle: 'AI Queue Management',
    title: 'Queue Management',
    subtitle: 'Real-time queue monitoring and customer management',
    live: 'Live',
    customersWaiting: 'Customers Waiting',
    avgWait: 'Avg. Wait Time',
    serviceDesks: 'Service Desks Available',
    good: 'Good',
    active: 'Active',
    addCustomer: 'Add Customer',
    aiBalancer: 'AI Load Balancer',
    queueTitle: 'Real-Time Queue',
    token: 'Token',
    customer: 'Customer Name',
    serviceType: 'Service Type',
    assignedDesk: 'Assigned Desk',
    priority: 'Priority',
    waitTime: 'Wait Time',
    status: 'Status',
    normal: 'Normal',
    urgent: 'Urgent',
    emergency: 'Emergency',
    consultation: 'In Consultation',
    waiting: 'Waiting',
    admin: 'Admin User',
    role: 'System Administrator',
    logout: 'Logout',
    years: 'years',
    min: 'min',
    menu: [
      'Dashboard',
      'Customer Registration',
      'Service Desk',
      'Queue Display',
      'AI Load Balancer',
      'Analytics',
      'Settings',
    ],
  },
} satisfies Record<Lang, Record<string, string | string[]>>

const serviceTypes: Record<Lang, string[]> = {
  ru: ['Общая услуга', 'Премиум услуга', 'Быстрая услуга', 'Общая услуга', 'Техподдержка'],
  kk: ['Жалпы қызмет', 'Премиум қызмет', 'Жылдам қызмет', 'Жалпы қызмет', 'Техқолдау'],
  en: ['General Service', 'Premium Service', 'Quick Service', 'General Service', 'Technical Support'],
}

const customers = [
  { token: 'T101', name: 'John Anderson', age: 45, phone: '+1 555-0101', desk: 'A', priority: 'normal', wait: 0, status: 'consultation' },
  { token: 'T102', name: 'Emma Wilson', age: 32, phone: '+1 555-0102', desk: 'B', priority: 'urgent', wait: 5, status: 'consultation' },
  { token: 'T103', name: 'Michael Brown', age: 28, phone: '+1 555-0103', desk: 'C', priority: 'normal', wait: 12, status: 'waiting' },
  { token: 'T104', name: 'Sarah Martinez', age: 55, phone: '+1 555-0104', desk: 'A', priority: 'normal', wait: 18, status: 'waiting' },
  { token: 'T105', name: 'David Taylor', age: 38, phone: '+1 555-0105', desk: 'D', priority: 'emergency', wait: 8, status: 'waiting' },
] as const

const menuIcons = ['grid', 'user-plus', 'users', 'monitor', 'brain', 'chart', 'settings'] as const

function Icon({ name }: { name: string }) {
  return (
    <svg className="dashboard-icon" viewBox="0 0 24 24" aria-hidden="true">
      {name === 'grid' && <path d="M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z" />}
      {name === 'user-plus' && <path d="M15 19a6 6 0 0 0-12 0M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8M19 8v6M16 11h6" />}
      {name === 'users' && <path d="M16 19a5 5 0 0 0-10 0M11 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8M20 19a4 4 0 0 0-3-3.8M17 4.3a3.2 3.2 0 0 1 0 6.2" />}
      {name === 'monitor' && <path d="M4 5h16v11H4zM9 20h6M12 16v4" />}
      {name === 'brain' && <path d="M8 5a3 3 0 0 0-3 3v1a3 3 0 0 0 0 6v1a3 3 0 0 0 5 2.2M16 5a3 3 0 0 1 3 3v1a3 3 0 0 1 0 6v1a3 3 0 0 1-5 2.2M12 4v16M8 10h2M14 10h2M8 15h2M14 15h2" />}
      {name === 'chart' && <path d="M4 18 9 13l4 3 7-9M4 20h16" />}
      {name === 'settings' && <path d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6M19 12a7 7 0 0 0-.1-1l2-1.5-2-3.4-2.4 1a7 7 0 0 0-1.7-1L14.5 3h-5l-.3 3.1a7 7 0 0 0-1.7 1l-2.4-1-2 3.4 2 1.5a7 7 0 0 0 0 2l-2 1.5 2 3.4 2.4-1a7 7 0 0 0 1.7 1l.3 3.1h5l.3-3.1a7 7 0 0 0 1.7-1l2.4 1 2-3.4-2-1.5a7 7 0 0 0 .1-1" />}
      {name === 'clock' && <path d="M12 7v5l3 2M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0" />}
      {name === 'pulse' && <path d="M4 13h4l2-7 4 12 2-5h4" />}
      {name === 'plus' && <path d="M12 5v14M5 12h14" />}
      {name === 'refresh' && <path d="M20 12a8 8 0 0 1-13.7 5.7M4 12A8 8 0 0 1 17.7 6.3M18 3v4h-4M6 21v-4h4" />}
    </svg>
  )
}

export function DashboardPage() {
  const [lang, setLang] = useState<Lang>(getInitialLang)
  const t = labels[lang]

  useEffect(() => {
    localStorage.setItem(LANG_STORAGE_KEY, lang)

    const localizedPath = buildLocalizedPath(lang)
    const currentPath = `${window.location.pathname}${window.location.search}${window.location.hash}`

    if (localizedPath !== currentPath) {
      window.history.replaceState(null, '', localizedPath)
    }
  }, [lang])

  const translatedRows = useMemo(
    () =>
      customers.map((customer, index) => ({
        ...customer,
        service: serviceTypes[lang][index],
        deskLabel: `${lang === 'en' ? 'Service Desk' : lang === 'kk' ? 'Терезе' : 'Окно'} ${customer.desk}`,
      })),
    [lang],
  )

  return (
    <div className="dashboard-layout">
      <aside className="dashboard-sidebar">
        <div className="dashboard-brand">
          <div className="brand-mark">
            <Icon name="users" />
          </div>
          <div>
            <strong>{t.appName}</strong>
            <span>{t.appSubtitle}</span>
          </div>
        </div>

        <nav className="dashboard-nav" aria-label="Dashboard navigation">
          {(t.menu as string[]).map((item, index) => (
            <button className={index === 0 ? 'nav-item active' : 'nav-item'} type="button" key={item}>
              <Icon name={menuIcons[index]} />
              <span>{item}</span>
            </button>
          ))}
        </nav>

        <div className="sidebar-user">
          <div className="user-avatar">A</div>
          <div>
            <strong>{t.admin}</strong>
            <span>{t.role}</span>
          </div>
        </div>
      </aside>

      <main className="dashboard-main">
        <header className="dashboard-header">
          <div>
            <h1>{t.title}</h1>
            <p>{t.subtitle}</p>
          </div>
          <div className="header-actions">
            <div className="language-switcher" aria-label="Language switcher">
              {languages.map((language) => (
                <button
                  className={language === lang ? 'selected' : ''}
                  type="button"
                  key={language}
                  onClick={() => setLang(language)}
                >
                  {language.toUpperCase()}
                </button>
              ))}
            </div>
            <span className="live-badge">
              <span />
              {t.live}
            </span>
            <button
              className="logout-button"
              type="button"
              onClick={() => {
                tokenStorage.clear()
                window.location.reload()
              }}
            >
              {t.logout}
            </button>
          </div>
        </header>

        <section className="stats-grid" aria-label="Queue statistics">
          <article className="stat-card">
            <div className="stat-top">
              <span className="stat-icon">
                <Icon name="users" />
              </span>
              <span>{t.live}</span>
            </div>
            <strong>3</strong>
            <p>{t.customersWaiting}</p>
          </article>
          <article className="stat-card">
            <div className="stat-top">
              <span className="stat-icon">
                <Icon name="clock" />
              </span>
              <span className="status-good">{t.good}</span>
            </div>
            <strong>13 {t.min}</strong>
            <p>{t.avgWait}</p>
          </article>
          <article className="stat-card">
            <div className="stat-top">
              <span className="stat-icon">
                <Icon name="pulse" />
              </span>
              <span>{t.active}</span>
            </div>
            <strong>6</strong>
            <p>{t.serviceDesks}</p>
          </article>
        </section>

        <div className="dashboard-toolbar">
          <button className="primary-action" type="button">
            <Icon name="plus" />
            {t.addCustomer}
          </button>
          <button className="secondary-action" type="button">
            <Icon name="refresh" />
            {t.aiBalancer}
          </button>
        </div>

        <section className="queue-panel">
          <h2>{t.queueTitle}</h2>
          <div className="queue-table-wrap">
            <table className="queue-table">
              <thead>
                <tr>
                  <th>{t.token}</th>
                  <th>{t.customer}</th>
                  <th>{t.serviceType}</th>
                  <th>{t.assignedDesk}</th>
                  <th>{t.priority}</th>
                  <th>{t.waitTime}</th>
                  <th>{t.status}</th>
                </tr>
              </thead>
              <tbody>
                {translatedRows.map((customer) => (
                  <tr key={customer.token}>
                    <td className="token-cell">{customer.token}</td>
                    <td>
                      <strong>{customer.name}</strong>
                      <span>
                        {customer.age} {t.years} • {customer.phone}
                      </span>
                    </td>
                    <td>{customer.service}</td>
                    <td>{customer.deskLabel}</td>
                    <td>
                      <span className={`pill priority-${customer.priority}`}>
                        {t[customer.priority]}
                      </span>
                    </td>
                    <td>
                      <span className={customer.wait >= 18 ? 'wait-time delayed' : 'wait-time'}>
                        <Icon name="clock" />
                        {customer.wait} {t.min}
                      </span>
                    </td>
                    <td>
                      <span className={`pill status-${customer.status}`}>
                        {t[customer.status]}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </main>
    </div>
  )
}
