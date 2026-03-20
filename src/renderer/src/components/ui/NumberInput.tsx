import { forwardRef } from 'react'
import { MONO } from '../../lib/tokens'

type NumberInputProps = React.ComponentProps<'input'> & {
  hasError?: boolean
  prefix?: string
}

export const NumberInput = forwardRef<HTMLInputElement, NumberInputProps>(function NumberInput(
  { hasError, prefix, style, ...props },
  ref
) {
  const borderColor = hasError ? 'var(--wb-red)' : 'var(--wb-border)'

  const inputEl = (
    <input
      ref={ref}
      style={{
        ...(prefix
          ? { flex: 1, background: 'transparent', border: 'none' }
          : {
              width: '100%',
              borderRadius: 6,
              border: `1px solid ${borderColor}`,
              background: 'var(--wb-bg-elevated)',
              boxSizing: 'border-box' as const
            }),
        padding: '10px 14px',
        color: 'var(--wb-text-primary)',
        fontSize: '0.9375rem',
        fontFamily: MONO,
        outline: 'none',
        transition: 'border-color 0.15s',
        ...style
      }}
      {...props}
    />
  )

  if (!prefix) return inputEl

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        border: `1px solid ${borderColor}`,
        borderRadius: 6,
        background: 'var(--wb-bg-elevated)',
        overflow: 'hidden'
      }}
    >
      <span
        style={{
          padding: '0 10px',
          fontSize: 13,
          color: 'var(--wb-text-muted)',
          fontFamily: MONO,
          borderRight: '1px solid var(--wb-border)',
          alignSelf: 'stretch',
          display: 'flex',
          alignItems: 'center'
        }}
      >
        {prefix}
      </span>
      {inputEl}
    </div>
  )
})
