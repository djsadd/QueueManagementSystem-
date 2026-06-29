import type { UserItem } from '../../../features/admin/api/adminApi'
import { CrudTable } from '../components/CrudTable'
import { RowActions } from '../components/RowActions'
import { boolLabel } from '../dashboard-formatters'

export function UsersRoute({
  loading,
  onDelete,
  onEdit,
  users,
}: {
  loading: boolean
  onDelete: (user: UserItem) => void
  onEdit: (user: UserItem) => void
  users: UserItem[]
}) {
  return (
    <section className="admin-panel tab-panel" key="users">
      <CrudTable
        columns={['ID', 'ФИО', 'Email', 'Роль', 'Статус', 'Действия']}
        loading={loading}
        rows={users.map((user) => [
          user.id.slice(0, 8),
          user.full_name,
          user.email,
          user.role,
          boolLabel(user.is_active),
          <RowActions
            key={user.id}
            onEdit={() => onEdit(user)}
            onDelete={() => onDelete(user)}
          />,
        ])}
      />
    </section>
  )
}
