import type { OperatorItem, UserItem, WindowItem } from '../../../features/admin/api/adminApi'
import { CrudTable } from '../components/CrudTable'
import { RowActions } from '../components/RowActions'
import { getOperatorLabel } from '../dashboard-formatters'

export function WindowsRoute({
  loading,
  onDelete,
  onEdit,
  operators,
  users,
  windows,
}: {
  loading: boolean
  onDelete: (windowItem: WindowItem) => void
  onEdit: (windowItem: WindowItem, assignedOperatorId: string) => void
  operators: OperatorItem[]
  users: UserItem[]
  windows: WindowItem[]
}) {
  return (
    <section className="admin-panel tab-panel" key="windows">
      <CrudTable
        columns={['ID', 'Название', 'Этаж', 'Статус', 'Оператор', 'Действия']}
        loading={loading}
        rows={windows.map((windowItem) => {
          const assignedOperator = operators.find((operator) => operator.window_id === windowItem.id)

          return [
            windowItem.id,
            windowItem.name,
            windowItem.floor ?? 'Не указан',
            windowItem.status,
            getOperatorLabel(operators, users, assignedOperator?.id ?? null),
            <RowActions
              key={windowItem.id}
              onEdit={() => onEdit(windowItem, assignedOperator?.id ?? '')}
              onDelete={() => onDelete(windowItem)}
            />,
          ]
        })}
      />
    </section>
  )
}
