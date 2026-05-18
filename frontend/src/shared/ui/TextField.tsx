import type { InputHTMLAttributes } from 'react'

type TextFieldProps = InputHTMLAttributes<HTMLInputElement> & {
  label: string
  error?: string
}

export function TextField({ id, label, error, ...props }: TextFieldProps) {
  const fieldId = id ?? props.name

  return (
    <label className="text-field" htmlFor={fieldId}>
      <span>{label}</span>
      <input id={fieldId} aria-invalid={Boolean(error)} {...props} />
      {error ? <small>{error}</small> : null}
    </label>
  )
}
