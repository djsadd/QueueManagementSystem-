import type { ServiceItem } from '../../../features/admin/api/adminApi'
import { CrudTable } from '../components/CrudTable'
import { RowActions } from '../components/RowActions'
import { boolLabel } from '../dashboard-formatters'

export function ServicesRoute({
  loading,
  onDelete,
  onEdit,
  services,
}: {
  loading: boolean
  onDelete: (service: ServiceItem) => void
  onEdit: (service: ServiceItem) => void
  services: ServiceItem[]
}) {
  return (
    <section className="admin-panel tab-panel" key="services">
      <CrudTable
        columns={[
          'ID',
          'Название (RU)',
          'Название (KZ)',
          'Название (EN)',
          'Код',
          'Приоритет',
          'Обр. программа',
          'Язык обслуживания',
          'Регистратура',
          'Статус',
          'Действия',
        ]}
        loading={loading}
        rows={services.map((service) => [
          service.id,
          service.name,
          service.name_kk,
          service.name_en,
          service.code,
          service.priority,
          boolLabel(service.requires_educational_program),
          boolLabel(service.requires_service_language),
          boolLabel(service.requires_reception_desk),
          boolLabel(service.is_active),
          <RowActions
            key={service.id}
            onEdit={() => onEdit(service)}
            onDelete={() => onDelete(service)}
          />,
        ])}
      />
    </section>
  )
}
