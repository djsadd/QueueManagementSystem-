import type {
  EducationalProgramItem,
  OperatorItem,
  ServiceItem,
  UserItem,
  WindowItem,
} from '../../../features/admin/api/adminApi'
import { CrudTable } from '../components/CrudTable'
import {
  getProgramLabels,
  getServiceLabels,
  getUserLabel,
  getWindowLabel,
  operatorStatusLabels,
} from '../dashboard-formatters'

export function OperatorsRoute({
  analyticsHref,
  educationalPrograms,
  lang,
  loading,
  onDelete,
  onEdit,
  onOpenAnalytics,
  operatorProgramIds,
  operatorServiceIds,
  operators,
  services,
  users,
  windows,
}: {
  analyticsHref: (lang: string, operatorId: string) => string
  educationalPrograms: EducationalProgramItem[]
  lang: string
  loading: boolean
  onDelete: (operator: OperatorItem) => void
  onEdit: (operator: OperatorItem) => void
  onOpenAnalytics: (operatorId: string) => void
  operatorProgramIds: Record<string, number[]>
  operatorServiceIds: Record<string, number[]>
  operators: OperatorItem[]
  services: ServiceItem[]
  users: UserItem[]
  windows: WindowItem[]
}) {
  return (
    <section className="admin-panel tab-panel" key="operators">
      <CrudTable
        columns={['ID', 'Пользователь', 'Окно', 'Услуги', 'ОП', 'Статус', 'Дата создания', 'Действия']}
        loading={loading}
        rows={operators.map((operator) => [
          operator.id.slice(0, 8),
          getUserLabel(users, operator.user_id),
          getWindowLabel(windows, operator.window_id),
          getServiceLabels(services, operatorServiceIds[operator.id] ?? []),
          getProgramLabels(educationalPrograms, operatorProgramIds[operator.id] ?? []),
          operatorStatusLabels[operator.status],
          new Date(operator.created_at).toLocaleString(),
          <div className="row-actions" key={operator.id}>
            <a
              className="secondary-action compact"
              href={analyticsHref(lang, operator.id)}
              onClick={(event) => {
                event.preventDefault()
                onOpenAnalytics(operator.id)
              }}
            >
              Отчет
            </a>
            <button className="secondary-action compact" type="button" onClick={() => onEdit(operator)}>
              Изменить
            </button>
            <button className="danger-action" type="button" onClick={() => onDelete(operator)}>
              Удалить
            </button>
          </div>,
        ])}
      />
    </section>
  )
}
