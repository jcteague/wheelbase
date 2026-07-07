import { zodResolver } from '@hookform/resolvers/zod'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { resolveManagementWindowDte } from '../../../main/core/alerts'
import { resolveProfitTarget } from '../../../main/core/profit-target'
import { useSaveAlertOverrides } from '../hooks/useSaveAlertOverrides'
import { useAlertDefaults } from '../hooks/useSettings'
import { alertThresholdsSchema, type AlertThresholdsFormValues } from '../schemas/alert-thresholds'
import { Field } from './ui/FormField'
import { FormButton } from './ui/FormButton'
import { NumberInput } from './ui/NumberInput'
import { SectionCard } from './ui/SectionCard'

type PositionAlertOverridesFormProps = {
  positionId: string
  profitTargetPercent: number | null
  managementWindowDteOverride: number | null
}

export function PositionAlertOverridesForm({
  positionId,
  profitTargetPercent,
  managementWindowDteOverride
}: PositionAlertOverridesFormProps): React.JSX.Element {
  const { data: alertDefaults } = useAlertDefaults()
  const saveMutation = useSaveAlertOverrides()

  const [customEnabled, setCustomEnabled] = useState(
    profitTargetPercent !== null || managementWindowDteOverride !== null
  )

  const effectiveProfitTarget = resolveProfitTarget(
    profitTargetPercent,
    alertDefaults?.profitTargetPercent
  )
  const effectiveManagementWindowDte = resolveManagementWindowDte(
    managementWindowDteOverride,
    alertDefaults?.managementWindowDte
  )

  const form = useForm<AlertThresholdsFormValues>({
    resolver: zodResolver(alertThresholdsSchema),
    mode: 'onChange',
    // Reactive `values` re-syncs the fields once the async global defaults resolve
    // (or the position's persisted override changes). A one-time `defaultValues`
    // snapshot would freeze the hardcoded fallback captured before the query loaded.
    values: {
      profitTargetPercent: String(effectiveProfitTarget),
      managementWindowDte: String(effectiveManagementWindowDte)
    }
  })

  function onSubmit(values: AlertThresholdsFormValues): void {
    saveMutation.mutate(
      {
        positionId,
        profitTargetPercent: parseInt(values.profitTargetPercent, 10),
        managementWindowDte: parseInt(values.managementWindowDte, 10)
      },
      { onSuccess: () => setCustomEnabled(true) }
    )
  }

  function clearOverrides(): void {
    saveMutation.mutate(
      { positionId, profitTargetPercent: null, managementWindowDte: null },
      { onSuccess: () => setCustomEnabled(false) }
    )
  }

  // Unchecking "Custom alerts" must persist the cleared override, not merely flip
  // local state — otherwise the banner reads "Using global defaults" while the DB
  // keeps firing the stale per-position threshold. Re-sync of the fields to the
  // global default is driven by the refetched props flowing into `values`.
  function handleCustomToggle(checked: boolean): void {
    if (checked) {
      setCustomEnabled(true)
    } else {
      clearOverrides()
    }
  }

  return (
    <SectionCard header="Per-Position Alert Thresholds">
      <div className="flex flex-col gap-4 p-5">
        <div
          className={[
            'rounded-md border px-3 py-2.5 font-wb-mono text-[0.72rem]',
            customEnabled
              ? 'border-wb-gold-border bg-wb-gold-dim text-wb-gold'
              : 'border-wb-blue/30 bg-wb-blue-dim text-wb-blue'
          ].join(' ')}
        >
          {customEnabled ? 'Custom alert thresholds active' : 'Using global defaults'}
        </div>

        <div className="flex items-center gap-2">
          <input
            id="custom-alerts-toggle"
            type="checkbox"
            checked={customEnabled}
            onChange={(e) => handleCustomToggle(e.target.checked)}
          />
          <label
            htmlFor="custom-alerts-toggle"
            className="font-wb-mono text-xs text-wb-text-secondary"
          >
            Custom alerts
          </label>
        </div>

        <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col gap-4">
          <Field
            label="Profit Target Override"
            htmlFor="override-profit-target-percent"
            error={form.formState.errors.profitTargetPercent?.message}
          >
            <NumberInput
              id="override-profit-target-percent"
              type="number"
              aria-label="Profit Target Override"
              disabled={!customEnabled}
              {...form.register('profitTargetPercent')}
            />
          </Field>

          <Field
            label="Management Window Override"
            htmlFor="override-management-window-dte"
            error={form.formState.errors.managementWindowDte?.message}
          >
            <NumberInput
              id="override-management-window-dte"
              type="number"
              aria-label="Management Window Override"
              disabled={!customEnabled}
              {...form.register('managementWindowDte')}
            />
          </Field>

          <div className="flex gap-2">
            <FormButton
              label="Save overrides"
              pendingLabel="Saving..."
              isPending={saveMutation.isPending}
              disabled={!customEnabled || !form.formState.isValid}
            />
            <FormButton label="Use global defaults" variant="secondary" onClick={clearOverrides} />
          </div>
        </form>
      </div>
    </SectionCard>
  )
}
