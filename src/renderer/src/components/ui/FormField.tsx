type FieldLabelProps = { children: React.ReactNode; htmlFor?: string }

export function FieldLabel({ children, htmlFor }: FieldLabelProps): React.JSX.Element {
  return (
    <label
      htmlFor={htmlFor}
      className="block text-xs font-semibold tracking-widest uppercase text-wb-text-secondary font-wb-mono mb-1.5"
    >
      {children}
    </label>
  )
}

type FieldProps = {
  label: string
  htmlFor?: string
  error?: string
  hint?: string
  children: React.ReactNode
}

export function Field({ label, htmlFor, error, hint, children }: FieldProps): React.JSX.Element {
  return (
    <div className="flex flex-col gap-0">
      <FieldLabel htmlFor={htmlFor}>{label}</FieldLabel>
      {children}
      {hint && !error && <span className="text-xs text-wb-text-muted mt-1">{hint}</span>}
      {error && (
        <span className="text-xs text-wb-red mt-1 font-wb-mono" role="alert">
          {error}
        </span>
      )}
    </div>
  )
}
