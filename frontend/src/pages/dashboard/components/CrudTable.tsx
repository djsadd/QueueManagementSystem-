import type { ReactNode } from 'react'

export function CrudTable({
  columns,
  loading,
  rowClassNames,
  rowKeys,
  rows,
}: {
  columns: string[]
  loading: boolean
  rowClassNames?: string[]
  rowKeys?: Array<string | number>
  rows: Array<Array<string | number | ReactNode>>
}) {
  return (
    <div className="queue-panel">
      <div className="queue-table-wrap">
        <table className="queue-table admin-table">
          <thead>
            <tr>
              {columns.map((column) => (
                <th key={column}>{column}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan={columns.length}>Загрузка...</td>
              </tr>
            )}
            {!loading && rows.length === 0 && (
              <tr>
                <td colSpan={columns.length}>Данных пока нет</td>
              </tr>
            )}
            {!loading &&
              rows.map((row, rowIndex) => (
                <tr className={rowClassNames?.[rowIndex]} key={rowKeys?.[rowIndex] ?? rowIndex}>
                  {row.map((cell, cellIndex) => (
                    <td key={cellIndex}>{cell}</td>
                  ))}
                </tr>
              ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
