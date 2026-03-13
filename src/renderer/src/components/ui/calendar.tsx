import { DayPicker } from 'react-day-picker'
import 'react-day-picker/style.css'

export type CalendarProps = React.ComponentProps<typeof DayPicker>

export function Calendar({ className, ...props }: CalendarProps): React.JSX.Element {
  return (
    <DayPicker
      showOutsideDays
      className={className}
      style={
        {
          '--rdp-accent-color': 'var(--wb-gold)',
          '--rdp-accent-background-color': 'var(--wb-gold-dim)',
          '--rdp-day-height': '36px',
          '--rdp-day-width': '36px',
          '--rdp-selected-border': '2px solid var(--wb-gold)',
          colorScheme: 'dark'
        } as React.CSSProperties
      }
      {...props}
    />
  )
}
