import type { AcademicDegreeItem } from '../../../features/admin/api/adminApi'
import { CrudTable } from '../components/CrudTable'
import { RowActions } from '../components/RowActions'
import { boolLabel } from '../dashboard-formatters'

export function AcademicDegreesRoute({
  academicDegrees,
  loading,
  onDelete,
  onEdit,
}: {
  academicDegrees: AcademicDegreeItem[]
  loading: boolean
  onDelete: (degree: AcademicDegreeItem) => void
  onEdit: (degree: AcademicDegreeItem) => void
}) {
  return (
    <section className="admin-panel tab-panel" key="academicDegrees">
      <CrudTable
        columns={['ID', 'Название', 'Код', 'Статус', 'Действия']}
        loading={loading}
        rows={academicDegrees.map((degree) => [
          degree.id,
          degree.name,
          degree.code,
          boolLabel(degree.is_active),
          <RowActions
            key={degree.id}
            onEdit={() => onEdit(degree)}
            onDelete={() => onDelete(degree)}
          />,
        ])}
      />
    </section>
  )
}
