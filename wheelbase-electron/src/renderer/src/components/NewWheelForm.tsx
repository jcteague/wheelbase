import { zodResolver } from '@hookform/resolvers/zod'
import { useState, useEffect } from 'react'
import { useForm } from 'react-hook-form'

import { Button } from '@/components/ui/button'
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage
} from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { newWheelSchema, type NewWheelFormValues } from '@/schemas/new-wheel'
import type { ApiError, ApiFieldError } from '../api/positions'
import { useCreatePosition } from '../hooks/useCreatePosition'

const REDIRECT_DELAY_MS = 2000

const API_TO_FORM_FIELD: Record<string, keyof NewWheelFormValues> = {
  ticker: 'ticker',
  strike: 'strike',
  expiration: 'expiration',
  contracts: 'contracts',
  premium_per_contract: 'premiumPerContract',
  fill_date: 'fillDate'
}

type NewWheelFormProps = {
  navigate?: (path: string) => void
}

export function NewWheelForm({ navigate = () => {} }: NewWheelFormProps): React.JSX.Element {
  const [advancedOpen, setAdvancedOpen] = useState(false)
  const mutation = useCreatePosition()

  const form = useForm<NewWheelFormValues>({
    resolver: zodResolver(newWheelSchema),
    mode: 'onBlur',
    defaultValues: {
      ticker: '',
      strike: '',
      expiration: '',
      contracts: '',
      premiumPerContract: '',
      fillDate: undefined,
      thesis: undefined,
      notes: undefined
    }
  })

  useEffect(() => {
    if (!mutation.isSuccess || !mutation.data) return
    const id = mutation.data.position.id
    const timer = setTimeout(() => navigate(`/positions/${id}`), REDIRECT_DELAY_MS)
    return () => clearTimeout(timer)
  }, [mutation.isSuccess, mutation.data, navigate])

  function onSubmit(values: NewWheelFormValues): void {
    mutation.mutate({
      ticker: values.ticker,
      strike: parseFloat(values.strike),
      expiration: values.expiration,
      contracts: parseInt(values.contracts, 10),
      premium_per_contract: parseFloat(values.premiumPerContract),
      fill_date: values.fillDate || undefined,
      thesis: values.thesis || undefined,
      notes: values.notes || undefined
    })
  }

  useEffect(() => {
    if (!mutation.isError || !mutation.error) return
    const err = mutation.error as ApiError
    if (err.status !== 400) return

    const body = err.body as { detail?: ApiFieldError[] }
    body.detail?.forEach((fe) => {
      const key = API_TO_FORM_FIELD[fe.field]
      if (key) {
        form.setError(key, { message: fe.message })
      }
    })
  }, [mutation.isError, mutation.error, form])

  const isServerError = mutation.isError && (mutation.error as ApiError)?.status !== 400

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} noValidate>
        {mutation.isSuccess && mutation.data && (
          <div role="status" aria-live="polite" aria-label="Success">
            <p>Wheel opened for {mutation.data.position.ticker}</p>
            <p>Contracts: {mutation.data.leg.contracts}</p>
            <p>Premium collected: {mutation.data.cost_basis_snapshot.total_premium_collected}</p>
            <p>Cost basis: {mutation.data.cost_basis_snapshot.basis_per_share}</p>
            <Button
              type="button"
              onClick={() => navigate(`/positions/${mutation.data!.position.id}`)}
            >
              View position
            </Button>
          </div>
        )}

        {isServerError && (
          <div role="alert" aria-live="assertive">
            Something went wrong. Please try again.
          </div>
        )}

        <FormField
          control={form.control}
          name="ticker"
          render={({ field }) => (
            <FormItem>
              <FormLabel htmlFor="ticker">Ticker</FormLabel>
              <FormControl>
                <Input id="ticker" {...field} aria-label="Ticker" />
              </FormControl>
              <FormMessage role="alert" aria-live="polite" />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="strike"
          render={({ field }) => (
            <FormItem>
              <FormLabel htmlFor="strike">Strike</FormLabel>
              <FormControl>
                <Input id="strike" type="text" inputMode="decimal" {...field} aria-label="Strike" />
              </FormControl>
              <FormMessage role="alert" aria-live="polite" />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="expiration"
          render={({ field }) => (
            <FormItem>
              <FormLabel htmlFor="expiration">Expiration</FormLabel>
              <FormControl>
                <Input
                  id="expiration"
                  type="text"
                  placeholder="YYYY-MM-DD"
                  {...field}
                  aria-label="Expiration"
                />
              </FormControl>
              <FormMessage role="alert" aria-live="polite" />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="contracts"
          render={({ field }) => (
            <FormItem>
              <FormLabel htmlFor="contracts">Contracts</FormLabel>
              <FormControl>
                <Input
                  id="contracts"
                  type="text"
                  inputMode="numeric"
                  {...field}
                  aria-label="Contracts"
                />
              </FormControl>
              <FormMessage role="alert" aria-live="polite" />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="premiumPerContract"
          render={({ field }) => (
            <FormItem>
              <FormLabel htmlFor="premiumPerContract">Premium per contract</FormLabel>
              <FormControl>
                <Input
                  id="premiumPerContract"
                  type="text"
                  inputMode="decimal"
                  {...field}
                  aria-label="Premium per contract"
                />
              </FormControl>
              <FormMessage role="alert" aria-live="polite" />
            </FormItem>
          )}
        />

        <div>
          <button
            type="button"
            aria-expanded={advancedOpen}
            onClick={() => setAdvancedOpen((v) => !v)}
          >
            Advanced
          </button>

          {advancedOpen && (
            <div>
              <FormField
                control={form.control}
                name="fillDate"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel htmlFor="fillDate">Fill date</FormLabel>
                    <FormControl>
                      <Input id="fillDate" type="date" {...field} aria-label="Fill date" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="thesis"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel htmlFor="thesis">Thesis</FormLabel>
                    <FormControl>
                      <Input id="thesis" type="text" {...field} aria-label="Thesis" />
                    </FormControl>
                    <FormMessage role="alert" aria-live="polite" />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="notes"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel htmlFor="notes">Notes</FormLabel>
                    <FormControl>
                      <Input id="notes" type="text" {...field} aria-label="Notes" />
                    </FormControl>
                    <FormMessage role="alert" aria-live="polite" />
                  </FormItem>
                )}
              />
            </div>
          )}
        </div>

        <Button type="submit" disabled={mutation.isPending}>
          Open wheel
        </Button>
      </form>
    </Form>
  )
}
