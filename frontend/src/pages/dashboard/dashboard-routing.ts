export type Lang = 'ru' | 'kk' | 'en'
export type CrudSection =
  | 'services'
  | 'windows'
  | 'users'
  | 'operators'
  | 'academicDegrees'
  | 'educationalPrograms'
  | 'applicants'
  | 'ticketEvents'
export type DashboardSection = CrudSection | 'profile' | 'myWindow' | 'analytics' | 'reception'
export type AnalyticsSelection = 'general' | string | null

export const LANG_STORAGE_KEY = 'queueflow-language'
export const ANALYTICS_SELECTION_STORAGE_KEY = 'queueflow-analytics-selection'
export const languages: Lang[] = ['ru', 'kk', 'en']

export const sectionLabels: Record<DashboardSection, string> = {
  myWindow: 'Мое окно',
  reception: 'Регистратура',
  profile: 'Профиль',
  services: 'Услуги',
  windows: 'Окна',
  users: 'Пользователи',
  operators: 'Операторы',
  academicDegrees: 'Академические степени',
  educationalPrograms: 'Образовательные программы',
  applicants: 'Абитуриенты',
  analytics: 'Аналитика',
  ticketEvents: 'История талонов',
}

export const sectionPaths: Record<DashboardSection, string> = {
  myWindow: 'my-window',
  reception: 'reception',
  profile: 'profile',
  services: 'services',
  windows: 'windows',
  users: 'users',
  operators: 'operators',
  academicDegrees: 'academic-degrees',
  educationalPrograms: 'educational-programs',
  applicants: 'applicants',
  analytics: 'analytics',
  ticketEvents: 'ticket-events',
}

export function isDashboardSection(value: string | undefined): value is DashboardSection {
  return (
    value === 'profile' ||
    value === 'reception' ||
    value === 'services' ||
    value === 'windows' ||
    value === 'users' ||
    value === 'operators' ||
    value === 'academic-degrees' ||
    value === 'educational-programs' ||
    value === 'applicants' ||
    value === 'analytics' ||
    value === 'ticket-events'
  )
}

function isLang(value: string | undefined): value is Lang {
  return languages.includes(value as Lang)
}

export function getInitialLang(): Lang {
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

export function getSectionFromPath(): DashboardSection {
  const pathParts = window.location.pathname.split('/').filter(Boolean)
  const sectionCandidate = pathParts[pathParts.length - 1]

  if (pathParts.includes('analytics')) {
    return 'analytics'
  }

  if (sectionCandidate === 'academic-degrees') {
    return 'academicDegrees'
  }

  if (sectionCandidate === 'educational-programs') {
    return 'educationalPrograms'
  }

  if (sectionCandidate === 'ticket-events') {
    return 'ticketEvents'
  }

  if (sectionCandidate === 'analytics') {
    return 'analytics'
  }

  if (sectionCandidate === 'my-window') {
    return 'myWindow'
  }

  if (sectionCandidate === 'reception') {
    return 'reception'
  }

  return isDashboardSection(sectionCandidate) ? sectionCandidate : 'services'
}

export function getAnalyticsSelectionFromPath(): AnalyticsSelection {
  const pathParts = window.location.pathname.split('/').filter(Boolean)
  const analyticsIndex = pathParts.indexOf('analytics')

  if (analyticsIndex === -1) {
    return null
  }

  const analyticsSelection = pathParts[analyticsIndex + 1]
  return analyticsSelection ? decodeURIComponent(analyticsSelection) : null
}

export function getSavedAnalyticsSelection(): AnalyticsSelection {
  return localStorage.getItem(ANALYTICS_SELECTION_STORAGE_KEY) || null
}

export function getInitialAnalyticsSelection(isAdminUser: boolean): AnalyticsSelection {
  if (!isAdminUser || getSectionFromPath() !== 'analytics') {
    return null
  }

  return getAnalyticsSelectionFromPath() ?? getSavedAnalyticsSelection()
}

export function isSpecificAnalyticsOperatorSelection(selection: AnalyticsSelection) {
  return selection !== null && selection !== 'general' && selection !== 'operators'
}

export function isCrudSection(section: DashboardSection): section is CrudSection {
  return (
    section === 'services' ||
    section === 'windows' ||
    section === 'users' ||
    section === 'operators' ||
    section === 'academicDegrees' ||
    section === 'educationalPrograms' ||
    section === 'applicants' ||
    section === 'ticketEvents'
  )
}

export function buildAnalyticsDataScopeKey(selection: AnalyticsSelection, dateFrom: string, dateTo: string) {
  return selection === null ? null : `${selection}:${dateFrom}:${dateTo}`
}

export function canUseOperatorSection(section: DashboardSection) {
  return section === 'myWindow' || section === 'profile'
}

export function buildSectionPath(lang: Lang, section: DashboardSection, analyticsSelection: AnalyticsSelection = null) {
  const analyticsSelectionPath =
    section === 'analytics' && analyticsSelection ? `/${encodeURIComponent(analyticsSelection)}` : ''

  return `/${lang}/admin/${sectionPaths[section]}${analyticsSelectionPath}${window.location.search}${window.location.hash}`
}

export function buildOperatorDisplayPath(lang: Lang) {
  return `/${lang}/admin/operator-display?fullscreen=1`
}
