import type {
  AcademicDegreeItem,
  EducationalProgramItem,
  OperatorItem,
  OperatorStatus,
  ServiceItem,
  UserItem,
  WindowItem,
} from '../../features/admin/api/adminApi'

export const operatorStatusLabels: Record<OperatorStatus, string> = {
  ONLINE: 'Готов',
  BUSY: 'Занят',
  BREAK: 'Отошел',
  OFFLINE: 'Не работает',
}

export function boolLabel(value: boolean) {
  return value ? 'Активно' : 'Выключено'
}

export function getUserLabel(users: UserItem[], userId: string) {
  const user = users.find((item) => item.id === userId)
  return user ? `${user.full_name} (${user.email})` : userId
}

export function getWindowLabel(windows: WindowItem[], windowId: number | null) {
  if (windowId === null) {
    return 'Не назначено'
  }

  const windowItem = windows.find((item) => item.id === windowId)
  return windowItem
    ? `${windowItem.name}${windowItem.floor ? `, этаж ${windowItem.floor}` : ''} (${windowItem.status})`
    : String(windowId)
}

export function getOperatorLabel(operators: OperatorItem[], users: UserItem[], operatorId: string | null) {
  if (operatorId === null) {
    return 'Не назначен'
  }

  const operator = operators.find((item) => item.id === operatorId)
  return operator ? getUserLabel(users, operator.user_id) : operatorId
}

export function getDegreeLabel(degrees: AcademicDegreeItem[], degreeId: number) {
  const degree = degrees.find((item) => item.id === degreeId)
  return degree ? `${degree.name} (${degree.code})` : String(degreeId)
}

export function getProgramLabels(programs: EducationalProgramItem[], programIds: number[]) {
  if (programIds.length === 0) {
    return 'Не выбрано'
  }

  return programIds
    .map((programId) => {
      const program = programs.find((item) => item.id === programId)
      return program ? program.code : String(programId)
    })
    .join(', ')
}

export function getServiceLabels(services: ServiceItem[], serviceIds: number[]) {
  if (serviceIds.length === 0) {
    return 'Не выбрано'
  }

  return serviceIds
    .map((serviceId) => {
      const service = services.find((item) => item.id === serviceId)
      return service ? service.code : String(serviceId)
    })
    .join(', ')
}
