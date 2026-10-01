import { FormButton } from './ui/FormButton'

export type Strategy = 'STANDARD' | 'PMCC'

const CHOICES: ReadonlyArray<{ value: Strategy; label: string }> = [
  { value: 'STANDARD', label: 'Standard' },
  { value: 'PMCC', label: 'PMCC' }
]

type StrategyToggleProps = {
  value: Strategy
  onChange: (value: Strategy) => void
  disabled?: boolean
}

/** [US-101] The New position sheet's `Standard / PMCC` switch. */
export function StrategyToggle({
  value,
  onChange,
  disabled = false
}: StrategyToggleProps): React.JSX.Element {
  return (
    <div
      role="group"
      aria-label="Position strategy"
      className="grid grid-cols-2 gap-1 rounded-lg border border-wb-border bg-wb-bg-elevated p-1"
    >
      {CHOICES.map((choice) => {
        const active = choice.value === value
        return (
          <FormButton
            key={choice.value}
            type="button"
            label={choice.label}
            aria-pressed={active}
            variant={active ? 'primary' : 'secondary'}
            disabled={disabled}
            onClick={() => onChange(choice.value)}
          />
        )
      })}
    </div>
  )
}
