import { MONO } from '../../lib/tokens'

type CaptionProps = { children: React.ReactNode }

export function Caption({ children }: CaptionProps): React.JSX.Element {
  return (
    <span
      style={{
        fontSize: '0.65rem',
        fontWeight: 600,
        letterSpacing: '0.1em',
        textTransform: 'uppercase',
        color: 'var(--wb-text-muted)',
        fontFamily: MONO
      }}
    >
      {children}
    </span>
  )
}
