import type { ApplicantItem } from '../../../features/admin/api/adminApi'
import { CrudTable } from '../components/CrudTable'
import { RowActions } from '../components/RowActions'

export function ApplicantsRoute({
  applicants,
  loading,
  onDelete,
  onEdit,
}: {
  applicants: ApplicantItem[]
  loading: boolean
  onDelete: (applicant: ApplicantItem) => void
  onEdit: (applicant: ApplicantItem) => void
}) {
  return (
    <section className="admin-panel tab-panel" key="applicants">
      <CrudTable
        columns={['ID', 'ФИО', 'ИИН', 'Телефон', 'Telegram Chat ID', 'Дата регистрации', 'Действия']}
        loading={loading}
        rows={applicants.map((applicant) => [
          applicant.id.slice(0, 8),
          applicant.full_name ?? 'Не указано',
          applicant.iin ?? 'Не указано',
          applicant.phone ?? 'Не указано',
          applicant.telegram_chat_id ?? 'Не указано',
          new Date(applicant.created_at).toLocaleString(),
          <RowActions
            key={applicant.id}
            onEdit={() => onEdit(applicant)}
            onDelete={() => onDelete(applicant)}
          />,
        ])}
      />
    </section>
  )
}
