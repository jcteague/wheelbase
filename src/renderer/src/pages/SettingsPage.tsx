import { zodResolver } from '@hookform/resolvers/zod'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import type { ApiError } from '../api/error'
import type {
  CredentialState,
  SaveAlpacaCredentialsPayload,
  SaveAlpacaCredentialsResult,
  TestStoredAlpacaConnectionPayload,
  TestSettingsConnectionResult
} from '../api/settings'
import { LiveBrokerConfirmDialog } from '../components/LiveBrokerConfirmDialog'
import { AlertBox } from '../components/ui/AlertBox'
import { PageHeader, PageLayout } from '../components/PageLayout'
import { usePositions } from '../hooks/usePositions'
import {
  useRemoveAlpacaCredentials,
  useSaveAlpacaCredentials,
  useSetActiveBrokerEnvironment,
  useSettingsStatus,
  useTestStoredAlpacaConnection,
  useTestSettingsConnection
} from '../hooks/useSettings'

const credentialsSchema = z.object({
  keyId: z.string().trim().min(1, 'API Key ID is required'),
  secret: z.string().trim().min(1, 'Secret Key is required')
})

type CredentialFormValues = z.infer<typeof credentialsSchema>

type ConnectionMessage = {
  tone: 'success' | 'error' | 'muted'
  text: string
}

function getApiErrorMessage(error: unknown): string {
  if (!error || typeof error !== 'object') {
    return 'Unable to complete the request'
  }

  const detail = (error as ApiError).body
  if (!detail || typeof detail !== 'object' || !('detail' in detail)) {
    return 'Unable to complete the request'
  }

  const [firstError] = detail.detail as Array<{ message?: string }>
  return firstError?.message ?? 'Unable to complete the request'
}

function Field({
  id,
  label,
  children
}: {
  id: string
  label: string
  children: React.ReactNode
}): React.JSX.Element {
  return (
    <label htmlFor={id} className="flex flex-col gap-2">
      <span className="font-wb-mono text-[0.64rem] font-semibold uppercase tracking-[0.12em] text-wb-text-muted">
        {label}
      </span>
      {children}
    </label>
  )
}

function StaticField({
  value,
  ariaLabel
}: {
  value: string
  ariaLabel: string
}): React.JSX.Element {
  return (
    <input
      readOnly
      aria-label={ariaLabel}
      value={value}
      className="h-10 w-full rounded-md border border-wb-border bg-wb-bg-elevated px-3 font-wb-mono text-sm text-wb-text-primary"
    />
  )
}

type AlpacaCredentialCardProps = {
  environment: 'paper' | 'live'
  configured: boolean
  accountNumberMasked: string | null
  onSave: (payload: SaveAlpacaCredentialsPayload) => Promise<SaveAlpacaCredentialsResult>
  onRemove: (payload: { environment: 'paper' | 'live' }) => Promise<unknown>
  onTestConnection: (
    payload: SaveAlpacaCredentialsPayload
  ) => Promise<TestSettingsConnectionResult | undefined>
  onTestStoredConnection: (
    payload: TestStoredAlpacaConnectionPayload
  ) => Promise<TestSettingsConnectionResult | undefined>
}

function AlpacaCredentialCard({
  environment,
  configured,
  accountNumberMasked,
  onSave,
  onRemove,
  onTestConnection,
  onTestStoredConnection
}: AlpacaCredentialCardProps): React.JSX.Element {
  const isPaper = environment === 'paper'
  const [isEditing, setIsEditing] = useState(!configured)
  const [message, setMessage] = useState<ConnectionMessage | null>(
    configured && accountNumberMasked
      ? {
          tone: 'success',
          text: `✓ Verified — Account ${accountNumberMasked} (${environment})`
        }
      : {
          tone: 'muted',
          text: 'Generate keys at app.alpaca.markets (Paper or Live tab)'
        }
  )

  const form = useForm<CredentialFormValues>({
    resolver: zodResolver(credentialsSchema),
    defaultValues: { keyId: '', secret: '' }
  })

  const label = isPaper ? 'Paper credentials' : 'Live credentials'
  const maskedKey = isPaper ? 'PK_••••••••••••• (paper)' : 'AK_••••••••••••• (live)'

  async function handleTestConnection(values: CredentialFormValues): Promise<void> {
    const result = await onTestConnection({ environment, ...values })
    if (!result) {
      return
    }
    if (result.ok && result.vendor === 'alpaca') {
      setMessage({
        tone: 'success',
        text: `✓ Verified — Account ${result.accountNumberMasked} (${result.environment})`
      })
      return
    }
    if (result.ok) {
      return
    }
    setMessage({
      tone: 'error',
      text: result.message
    })
  }

  async function handleSave(values: CredentialFormValues): Promise<void> {
    try {
      const result = await onSave({ environment, ...values })
      setMessage({
        tone: 'success',
        text: `✓ Verified — Account ${result.test.accountNumberMasked} (${result.test.environment})`
      })
      setIsEditing(false)
      form.reset()
    } catch (error) {
      setMessage({
        tone: 'error',
        text: getApiErrorMessage(error)
      })
    }
  }

  async function handleStoredConnectionTest(): Promise<void> {
    const result = await onTestStoredConnection({ environment })
    if (!result) {
      return
    }
    if (result.ok && result.vendor === 'alpaca') {
      setMessage({
        tone: 'success',
        text: `✓ Verified — Account ${result.accountNumberMasked} (${result.environment})`
      })
      return
    }
    if (result.ok) {
      return
    }
    setMessage({
      tone: 'error',
      text: result.message
    })
  }

  return (
    <div
      data-testid={`alpaca-card-${environment}`}
      className="flex min-w-[280px] flex-1 flex-col gap-4 rounded-lg border border-wb-border bg-wb-bg-elevated p-4"
    >
      <div className="flex items-center justify-between gap-3">
        <span className="font-wb-mono text-[0.72rem] font-bold uppercase tracking-[0.12em] text-wb-text-primary">
          {label}
        </span>
        <span
          className={[
            'font-wb-mono text-[0.62rem] tracking-[0.08em]',
            configured ? 'text-wb-green' : 'text-wb-text-muted'
          ].join(' ')}
        >
          {configured ? 'CONFIGURED' : 'NOT CONFIGURED'}
        </span>
      </div>

      {isEditing ? (
        <form className="flex flex-col gap-4" onSubmit={form.handleSubmit(handleSave)}>
          <Field id={`${environment}-key-id`} label="API Key ID">
            <input
              id={`${environment}-key-id`}
              aria-label="API Key ID"
              {...form.register('keyId')}
              className="h-10 w-full rounded-md border border-wb-border bg-wb-bg-surface px-3 font-wb-mono text-sm text-wb-text-primary"
              placeholder={isPaper ? 'PK_XXXXXXXXXXXX' : 'AK_XXXXXXXXXXXX'}
            />
          </Field>
          <Field id={`${environment}-secret-key`} label="Secret Key">
            <input
              id={`${environment}-secret-key`}
              aria-label="Secret Key"
              type="password"
              {...form.register('secret')}
              className="h-10 w-full rounded-md border border-wb-border bg-wb-bg-surface px-3 font-wb-mono text-sm text-wb-text-primary"
              placeholder="••••••••••••••••••••"
            />
          </Field>

          {message && (
            <p
              className={[
                'm-0 font-wb-mono text-[0.66rem] leading-5',
                message.tone === 'success'
                  ? 'text-wb-green'
                  : message.tone === 'error'
                    ? 'text-wb-red'
                    : 'text-wb-text-muted'
              ].join(' ')}
            >
              {message.text}
            </p>
          )}

          <div className="flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={form.handleSubmit(handleTestConnection)}
              className="rounded-md border border-wb-border px-3 py-2 font-wb-mono text-xs font-semibold tracking-[0.06em] text-wb-text-secondary"
            >
              Test connection
            </button>
            <div className="flex gap-2">
              {configured && (
                <button
                  type="button"
                  onClick={() => {
                    setIsEditing(false)
                    form.reset()
                  }}
                  className="rounded-md border border-wb-border px-3 py-2 font-wb-mono text-xs font-semibold tracking-[0.06em] text-wb-text-secondary"
                >
                  Cancel
                </button>
              )}
              <button
                type="submit"
                className="rounded-md bg-wb-gold px-3 py-2 font-wb-mono text-xs font-semibold tracking-[0.06em] text-wb-bg-base"
              >
                Save
              </button>
            </div>
          </div>
        </form>
      ) : (
        <>
          <Field id={`${environment}-masked-key`} label="API Key ID">
            <StaticField ariaLabel="API Key ID" value={maskedKey} />
          </Field>
          <Field id={`${environment}-masked-secret`} label="Secret Key">
            <StaticField ariaLabel="Secret Key" value="••••••••••••••••••••" />
          </Field>
          {message && (
            <p
              className={[
                'm-0 font-wb-mono text-[0.66rem] leading-5',
                message.tone === 'success'
                  ? 'text-wb-green'
                  : message.tone === 'error'
                    ? 'text-wb-red'
                    : 'text-wb-text-muted'
              ].join(' ')}
            >
              {message.text}
            </p>
          )}
          <div className="flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={() => void handleStoredConnectionTest()}
              className="rounded-md border border-wb-border px-3 py-2 font-wb-mono text-xs font-semibold tracking-[0.06em] text-wb-text-secondary"
            >
              Test connection
            </button>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setIsEditing(true)}
                className="rounded-md border border-wb-border px-3 py-2 font-wb-mono text-xs font-semibold tracking-[0.06em] text-wb-text-secondary"
              >
                Replace
              </button>
              <button
                type="button"
                onClick={() => void onRemove({ environment })}
                className="rounded-md border border-wb-border px-3 py-2 font-wb-mono text-xs font-semibold tracking-[0.06em] text-wb-text-secondary"
              >
                Remove
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  )
}

export function SettingsPage(): React.JSX.Element {
  const { data: status } = useSettingsStatus()
  const { data: positions } = usePositions()
  const saveMutation = useSaveAlpacaCredentials()
  const removeMutation = useRemoveAlpacaCredentials()
  const setActiveBrokerEnvironment = useSetActiveBrokerEnvironment()
  const testConnection = useTestSettingsConnection()
  const testStoredAlpacaConnection = useTestStoredAlpacaConnection()
  const [massiveMessage, setMassiveMessage] = useState<ConnectionMessage | null>(null)
  const [showLiveDialog, setShowLiveDialog] = useState(false)

  const activeStatus = status ?? {
    massive: 'missing' as CredentialState,
    alpacaPaper: 'missing' as CredentialState,
    alpacaLive: 'missing' as CredentialState,
    activeBrokerEnv: 'none' as const,
    massiveLastCheckedAt: null,
    alpacaPaperAccountNumberMasked: null,
    alpacaLiveAccountNumberMasked: null
  }

  const openPositionCount =
    positions?.filter((position) => position.status === 'ACTIVE').length ?? 0
  const isEmptyState =
    activeStatus.massive === 'missing' &&
    activeStatus.alpacaPaper === 'missing' &&
    activeStatus.alpacaLive === 'missing'
  const hasLiveCredentials = activeStatus.alpacaLive === 'configured'

  async function handleMassiveTestConnection(): Promise<void> {
    const result = await testConnection.mutateAsync({ vendor: 'massive' })
    if (result.ok && result.vendor === 'massive') {
      setMassiveMessage({ tone: 'success', text: 'Connected' })
      return
    }
    if (result.ok) {
      return
    }
    setMassiveMessage({ tone: 'error', text: result.message })
  }

  return (
    <>
      <PageLayout
        header={
          <PageHeader
            left={<h1 className="m-0 text-sm font-semibold text-wb-text-primary">Settings</h1>}
          />
        }
      >
        <div className="mx-auto flex w-full max-w-[1100px] flex-col gap-5 px-6 py-6">
          {isEmptyState && (
            <AlertBox variant="warning">
              Connect <strong>Massive</strong> to enable live market prices, Greeks, and option
              chains. Connect <strong>Alpaca</strong> to track buying power and broker activities.
              <strong> Massive provides data; Alpaca provides your account.</strong> Both are
              optional — only Massive is required to view market data.
            </AlertBox>
          )}

          <section
            role="region"
            aria-label="Market Data"
            className="rounded-lg border border-wb-border bg-wb-bg-surface"
          >
            <div className="border-b border-wb-border px-5 py-4">
              <div className="font-wb-mono text-[0.74rem] font-semibold uppercase tracking-[0.12em] text-wb-text-secondary">
                Market Data — Massive
              </div>
            </div>
            <div className="flex flex-col gap-4 px-5 py-5">
              <p className="m-0 font-wb-mono text-[0.72rem] leading-6 text-wb-text-secondary">
                Shared app configuration — Massive is app-provided and not stored in settings.
              </p>
              <div className="flex items-center justify-between gap-4">
                <span className="font-wb-mono text-[0.68rem] text-wb-text-muted">
                  {activeStatus.massiveLastCheckedAt
                    ? 'Last verified via shared Massive configuration'
                    : 'Shared market-data credentials are configured outside this page'}
                </span>
                <button
                  type="button"
                  onClick={() => void handleMassiveTestConnection()}
                  className="rounded-md border border-wb-border px-3 py-2 font-wb-mono text-xs font-semibold tracking-[0.06em] text-wb-text-secondary"
                >
                  Test connection
                </button>
              </div>
              {massiveMessage && (
                <p
                  className={[
                    'm-0 font-wb-mono text-[0.68rem]',
                    massiveMessage.tone === 'success' ? 'text-wb-green' : 'text-wb-red'
                  ].join(' ')}
                >
                  {massiveMessage.text}
                </p>
              )}
            </div>
          </section>

          <section
            role="region"
            aria-label="Broker"
            className="rounded-lg border border-wb-border bg-wb-bg-surface"
          >
            <div className="border-b border-wb-border px-5 py-4">
              <div className="font-wb-mono text-[0.74rem] font-semibold uppercase tracking-[0.12em] text-wb-text-secondary">
                Broker — Alpaca
              </div>
            </div>
            <div className="flex flex-col gap-5 px-5 py-5">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <span className="font-wb-mono text-[0.72rem] font-semibold uppercase tracking-[0.1em] text-wb-text-secondary">
                  Active Broker Environment
                </span>
                <div className="inline-flex rounded-md border border-wb-border bg-wb-bg-elevated p-1">
                  <label className="cursor-pointer">
                    <input
                      type="radio"
                      className="sr-only"
                      aria-label="Paper"
                      name="active-broker-environment"
                      checked={activeStatus.activeBrokerEnv === 'paper'}
                      onChange={() => setActiveBrokerEnvironment.mutate({ environment: 'paper' })}
                    />
                    <span
                      className={[
                        'inline-flex rounded px-4 py-2 font-wb-mono text-xs font-semibold tracking-[0.08em]',
                        activeStatus.activeBrokerEnv !== 'live'
                          ? 'border border-wb-gold-border bg-wb-gold-dim text-wb-gold'
                          : 'text-wb-text-muted'
                      ].join(' ')}
                    >
                      PAPER
                    </span>
                  </label>
                  <label className="cursor-pointer">
                    <input
                      type="radio"
                      className="sr-only"
                      aria-label="Live"
                      name="active-broker-environment"
                      disabled={!hasLiveCredentials}
                      checked={activeStatus.activeBrokerEnv === 'live'}
                      onChange={() => {
                        if (hasLiveCredentials) {
                          setShowLiveDialog(true)
                        }
                      }}
                    />
                    <span
                      className={[
                        'inline-flex rounded px-4 py-2 font-wb-mono text-xs font-semibold tracking-[0.08em]',
                        activeStatus.activeBrokerEnv === 'live'
                          ? 'border border-wb-green-border bg-wb-green-dim text-wb-green'
                          : 'text-wb-text-muted'
                      ].join(' ')}
                    >
                      LIVE
                    </span>
                  </label>
                </div>
              </div>

              {!hasLiveCredentials && (
                <p className="m-0 font-wb-mono text-[0.68rem] leading-5 text-wb-text-muted">
                  Save LIVE credentials before switching the active broker environment to LIVE.
                </p>
              )}

              <div className="flex flex-wrap gap-4">
                <AlpacaCredentialCard
                  environment="paper"
                  configured={activeStatus.alpacaPaper === 'configured'}
                  accountNumberMasked={activeStatus.alpacaPaperAccountNumberMasked}
                  onSave={(payload) => saveMutation.mutateAsync(payload)}
                  onRemove={(payload) => removeMutation.mutateAsync(payload)}
                  onTestConnection={(payload) =>
                    testConnection.mutateAsync({ vendor: 'alpaca', ...payload })
                  }
                  onTestStoredConnection={(payload) =>
                    testStoredAlpacaConnection.mutateAsync(payload)
                  }
                />
                <AlpacaCredentialCard
                  environment="live"
                  configured={activeStatus.alpacaLive === 'configured'}
                  accountNumberMasked={activeStatus.alpacaLiveAccountNumberMasked}
                  onSave={(payload) => saveMutation.mutateAsync(payload)}
                  onRemove={(payload) => removeMutation.mutateAsync(payload)}
                  onTestConnection={(payload) =>
                    testConnection.mutateAsync({ vendor: 'alpaca', ...payload })
                  }
                  onTestStoredConnection={(payload) =>
                    testStoredAlpacaConnection.mutateAsync(payload)
                  }
                />
              </div>

              <AlertBox variant="info">
                The <strong>PAPER</strong> badge in the header reflects your active broker
                environment. Switching to LIVE always requires confirmation; switching back to PAPER
                is immediate.
              </AlertBox>
            </div>
          </section>
        </div>
      </PageLayout>

      <LiveBrokerConfirmDialog
        isOpen={showLiveDialog}
        openPositionCount={openPositionCount}
        onCancel={() => setShowLiveDialog(false)}
        onConfirm={() => {
          setActiveBrokerEnvironment.mutate({ environment: 'live' })
          setShowLiveDialog(false)
        }}
      />
    </>
  )
}
