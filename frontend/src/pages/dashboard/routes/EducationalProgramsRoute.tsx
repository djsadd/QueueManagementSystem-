import type { AcademicDegreeItem, EducationalProgramItem } from '../../../features/admin/api/adminApi'
import { CrudTable } from '../components/CrudTable'
import { RowActions } from '../components/RowActions'
import { boolLabel, getDegreeLabel } from '../dashboard-formatters'

export function EducationalProgramsRoute({
  academicDegrees,
  educationalPrograms,
  loading,
  onDelete,
  onEdit,
}: {
  academicDegrees: AcademicDegreeItem[]
  educationalPrograms: EducationalProgramItem[]
  loading: boolean
  onDelete: (program: EducationalProgramItem) => void
  onEdit: (program: EducationalProgramItem) => void
}) {
  return (
    <section className="admin-panel tab-panel" key="educationalPrograms">
      <CrudTable
        columns={[
          'ID',
          'Название (RU)',
          'Название (KZ)',
          'Название (EN)',
          'Код',
          'Степень',
          'Требовать язык обслуживания',
          'Статус',
          'Действия',
        ]}
        loading={loading}
        rows={educationalPrograms.map((program) => [
          program.id,
          program.name,
          program.name_kk,
          program.name_en,
          program.code,
          getDegreeLabel(academicDegrees, program.academic_degree_id),
          boolLabel(program.requires_service_language),
          boolLabel(program.is_active),
          <RowActions
            key={program.id}
            onEdit={() => onEdit(program)}
            onDelete={() => onDelete(program)}
          />,
        ])}
      />
    </section>
  )
}
