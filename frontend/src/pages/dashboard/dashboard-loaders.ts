import {
  adminApi,
  type AcademicDegreeItem,
  type ApplicantItem,
  type EducationalProgramItem,
  type OperatorEducationalProgramItem,
  type OperatorItem,
  type OperatorServiceItem,
  type ServiceItem,
  type TicketEventTicketSummaryItem,
  type UserItem,
  type WindowItem,
} from '../../features/admin/api/adminApi'

export type DashboardCrudDataSection =
  | 'services'
  | 'windows'
  | 'users'
  | 'operators'
  | 'academicDegrees'
  | 'educationalPrograms'
  | 'applicants'
  | 'ticketEvents'

export type OperatorProgramsRow = {
  operatorId: string
  programs: OperatorEducationalProgramItem[]
}

export type OperatorServicesRow = {
  operatorId: string
  services: OperatorServiceItem[]
}

export type AdminDashboardPageData = {
  academicDegrees?: AcademicDegreeItem[]
  applicants?: ApplicantItem[]
  educationalPrograms?: EducationalProgramItem[]
  operatorProgramsRows?: OperatorProgramsRow[]
  operatorServicesRows?: OperatorServicesRow[]
  operators?: OperatorItem[]
  services?: ServiceItem[]
  ticketEventTickets?: TicketEventTicketSummaryItem[]
  users?: UserItem[]
  windows?: WindowItem[]
}

async function loadOperatorAssignments(operatorRows: OperatorItem[]) {
  const [operatorProgramsRows, operatorServicesRows] = await Promise.all([
    Promise.all(
      operatorRows.map(async (operator) => ({
        operatorId: operator.id,
        programs: await adminApi.operators.programs(operator.id),
      })),
    ),
    Promise.all(
      operatorRows.map(async (operator) => ({
        operatorId: operator.id,
        services: await adminApi.operators.services(operator.id),
      })),
    ),
  ])

  return { operatorProgramsRows, operatorServicesRows }
}

export async function loadAdminCrudPageData(section: DashboardCrudDataSection): Promise<AdminDashboardPageData> {
  if (section === 'services') {
    return { services: await adminApi.services.list() }
  }

  if (section === 'windows') {
    const [windows, operators, users] = await Promise.all([
      adminApi.windows.list(),
      adminApi.operators.list(),
      adminApi.users.list(),
    ])

    return { operators, users, windows }
  }

  if (section === 'users') {
    return { users: await adminApi.users.list() }
  }

  if (section === 'operators') {
    const [services, windows, users, operators, academicDegrees, educationalPrograms] = await Promise.all([
      adminApi.services.list(),
      adminApi.windows.list(),
      adminApi.users.list(),
      adminApi.operators.list(),
      adminApi.academicDegrees.list(),
      adminApi.educationalPrograms.list(),
    ])
    const assignments = await loadOperatorAssignments(operators)

    return {
      academicDegrees,
      educationalPrograms,
      operators,
      services,
      users,
      windows,
      ...assignments,
    }
  }

  if (section === 'academicDegrees') {
    return { academicDegrees: await adminApi.academicDegrees.list() }
  }

  if (section === 'educationalPrograms') {
    const [educationalPrograms, academicDegrees] = await Promise.all([
      adminApi.educationalPrograms.list(),
      adminApi.academicDegrees.list(),
    ])

    return { academicDegrees, educationalPrograms }
  }

  if (section === 'applicants') {
    return { applicants: await adminApi.applicants.list() }
  }

  const [ticketEventTickets, operators, users] = await Promise.all([
    adminApi.ticketEvents.ticketPage(),
    adminApi.operators.list(),
    adminApi.users.list(),
  ])

  return { operators, ticketEventTickets: ticketEventTickets.items, users }
}

export async function loadAdminProfilePageData(currentUserId: string | null): Promise<AdminDashboardPageData> {
  const [services, operators, academicDegrees, educationalPrograms] = await Promise.all([
    adminApi.services.list(),
    adminApi.operators.list(),
    adminApi.academicDegrees.list(),
    adminApi.educationalPrograms.list(),
  ])
  const currentOperator = currentUserId
    ? operators.find((operator) => operator.user_id === currentUserId)
    : undefined

  if (!currentOperator) {
    return {
      academicDegrees,
      educationalPrograms,
      operators,
      services,
    }
  }

  const [programs, operatorServices] = await Promise.all([
    adminApi.operators.programs(currentOperator.id),
    adminApi.operators.services(currentOperator.id),
  ])

  return {
    academicDegrees,
    educationalPrograms,
    operatorProgramsRows: [{ operatorId: currentOperator.id, programs }],
    operatorServicesRows: [{ operatorId: currentOperator.id, services: operatorServices }],
    operators,
    services,
  }
}
