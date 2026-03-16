import { MONO } from '../../lib/tokens'

type FieldLabelProps = { children: React.ReactNode; htmlFor?: string }

export function FieldLabel({ children, htmlFor }: FieldLabelProps): React.JSX.Element {
  return (
    <label
      htmlFor={htmlFor}
      style={{
        display: 'block',
        fontSize: '0.7rem',
        fontWeight: 600,
        letterSpacing: '0.07em',
        textTransform: 'uppercase',
        color: 'var(--wb-text-muted)',
        fontFamily: MONO,
        marginBottom: 6
      }}
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
    <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
      <FieldLabel htmlFor={htmlFor}>{label}</FieldLabel>
      {children}
      {hint && !error && (
        <span style={{ fontSize: '0.7rem', color: 'var(--wb-text-muted)', marginTop: 4 }}>
          {hint}
        </span>
      )}
      {error && (
        <span
          style={{ fontSize: '0.7rem', color: 'var(--wb-red)', marginTop: 4, fontFamily: MONO }}
          role="alert"
        >
          {error}
        </span>
      )}
    </div>
  )
}
