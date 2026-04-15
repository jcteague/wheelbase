import { format, parse, isValid } from 'date-fns'
import { useState } from 'react'

import { Calendar } from './calendar'
import { Popover, PopoverContent, PopoverTrigger } from './popover'

type DatePickerProps = {
  value?: string // YYYY-MM-DD string
  onChange: (value: string) => void
  onBlur?: () => void
  hasError?: boolean
  id?: string
  'aria-label'?: string
  'data-testid'?: string
}

export function DatePicker({
  value,
  onChange,
  onBlur,
  hasError,
  id,
  'aria-label': ariaLabel,
  'data-testid': dataTestId
}: DatePickerProps): React.JSX.Element {
  const [open, setOpen] = useState(false)

  const parsed = value ? parse(value, 'yyyy-MM-dd', new Date()) : undefined
  const selected = parsed && isValid(parsed) ? parsed : undefined

  function handleSelect(date: Date | undefined): void {
    if (date) {
      onChange(format(date, 'yyyy-MM-dd'))
      setOpen(false)
    }
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          id={id}
          data-testid={dataTestId}
          type="button"
          aria-label={ariaLabel ?? 'Pick a date'}
          aria-haspopup="dialog"
          onBlur={onBlur}
          className="font-wb-mono"
          style={{
            width: '100%',
            padding: '10px 14px',
            borderRadius: 6,
            border: `1px solid ${hasError ? 'var(--wb-red)' : 'var(--wb-border)'}`,
            background: 'var(--wb-bg-elevated)',
            color: selected ? 'var(--wb-text-primary)' : 'var(--wb-text-muted)',
            fontSize: '0.9375rem',
            textAlign: 'left',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 8
          }}
        >
          <span>{selected ? format(selected, 'yyyy-MM-dd') : 'Select date…'}</span>
          <CalendarIcon />
        </button>
      </PopoverTrigger>
      <PopoverContent>
        <Calendar
          mode="single"
          selected={selected}
          onSelect={handleSelect}
          defaultMonth={selected}
        />
      </PopoverContent>
    </Popover>
  )
}

function CalendarIcon(): React.JSX.Element {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="opacity-50 shrink-0"
    >
      <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
      <line x1="16" y1="2" x2="16" y2="6" />
      <line x1="8" y1="2" x2="8" y2="6" />
      <line x1="3" y1="10" x2="21" y2="10" />
    </svg>
  )
}
