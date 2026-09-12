import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, vi } from 'vitest'
import { SettingsPage } from './SettingsPage'
import { apiError } from '../api/error'
import type { CredentialStatus } from '../api/settings'
import { useCollectIvrNow } from '../hooks/useCollectIvrNow'
import {
  useAlertDefaults,
  useRemoveAlpacaCredentials,
  useSaveAlertDefaults,
  useSaveAlpacaCredentials,
  useSetActiveBrokerEnvironment,
  useSettingsStatus,
  useTestStoredAlpacaConnection,
  useTestSettingsConnection
} from '../hooks/useSettings'
import { usePositions } from '../hooks/usePositions'

vi.mock('../hooks/useSettings', () => ({
  useSettingsStatus: vi.fn(),
  useSaveAlpacaCredentials: vi.fn(),
  useRemoveAlpacaCredentials: vi.fn(),
  useSetActiveBrokerEnvironment: vi.fn(),
  useTestStoredAlpacaConnection: vi.fn(),
  useTestSettingsConnection: vi.fn(),
  useAlertDefaults: vi.fn(),
  useSaveAlertDefaults: vi.fn()
}))

vi.mock('../hooks/usePositions', () => ({
  usePositions: vi.fn()
}))

vi.mock('../hooks/useCollectIvrNow', () => ({
  useCollectIvrNow: vi.fn()
}))

const mockUseSettingsStatus = vi.mocked(useSettingsStatus)
const mockUseSaveAlpacaCredentials = vi.mocked(useSaveAlpacaCredentials)
const mockUseRemoveAlpacaCredentials = vi.mocked(useRemoveAlpacaCredentials)
const mockUseSetActiveBrokerEnvironment = vi.mocked(useSetActiveBrokerEnvironment)
const mockUseTestStoredAlpacaConnection = vi.mocked(useTestStoredAlpacaConnection)
const mockUseTestSettingsConnection = vi.mocked(useTestSettingsConnection)
const mockUsePositions = vi.mocked(usePositions)
const mockUseCollectIvrNow = vi.mocked(useCollectIvrNow)
const mockUseAlertDefaults = vi.mocked(useAlertDefaults)
const mockUseSaveAlertDefaults = vi.mocked(useSaveAlertDefaults)

const statusFixture = {
  marketData: 'configured' as const,
  alpacaPaper: 'configured' as const,
  alpacaLive: 'missing' as const,
  activeBrokerEnv: 'paper' as const,
  alpacaPaperAccountNumberMasked: 'PA…ABC',
  alpacaLiveAccountNumberMasked: null
}

beforeEach(() => {
  mockUseSettingsStatus.mockReturnValue({
    data: statusFixture,
    isLoading: false,
    isError: false,
    error: null
  } as ReturnType<typeof useSettingsStatus>)
  mockUseSaveAlpacaCredentials.mockReturnValue({
    mutateAsync: vi.fn()
  } as unknown as ReturnType<typeof useSaveAlpacaCredentials>)
  mockUseRemoveAlpacaCredentials.mockReturnValue({
    mutateAsync: vi.fn()
  } as unknown as ReturnType<typeof useRemoveAlpacaCredentials>)
  mockUseSetActiveBrokerEnvironment.mockReturnValue({
    mutate: vi.fn()
  } as unknown as ReturnType<typeof useSetActiveBrokerEnvironment>)
  mockUseTestSettingsConnection.mockReturnValue({
    mutateAsync: vi.fn()
  } as unknown as ReturnType<typeof useTestSettingsConnection>)
  mockUseTestStoredAlpacaConnection.mockReturnValue({
    mutateAsync: vi.fn()
  } as unknown as ReturnType<typeof useTestStoredAlpacaConnection>)
  mockUsePositions.mockReturnValue({
    data: [],
    isLoading: false,
    isError: false,
    error: null
  } as unknown as ReturnType<typeof usePositions>)
  mockUseCollectIvrNow.mockReturnValue({
    mutateAsync: vi.fn()
  } as unknown as ReturnType<typeof useCollectIvrNow>)
  mockUseAlertDefaults.mockReturnValue({
    data: { profitTargetPercent: 50, managementWindowDte: 21 },
    isLoading: false,
    isError: false,
    error: null
  } as ReturnType<typeof useAlertDefaults>)
  mockUseSaveAlertDefaults.mockReturnValue({
    mutate: vi.fn()
  } as unknown as ReturnType<typeof useSaveAlertDefaults>)
})

it('names Alpaca as the market-data source with no key input and no Test connection button', () => {
  render(<SettingsPage />)

  const section = screen.getByRole('region', { name: /market data/i })
  expect(within(section).getByText('Market Data — Alpaca')).toBeInTheDocument()
  expect(
    within(section).getByText(
      "Stock prices (IEX, real-time), option quotes (indicative) and Greeks come from Alpaca's free data feeds using your active broker credentials."
    )
  ).toBeInTheDocument()
  expect(
    within(section).queryByRole('button', { name: /test connection/i })
  ).not.toBeInTheDocument()
  expect(within(section).queryByLabelText(/api key id/i)).not.toBeInTheDocument()
  expect(within(section).queryByText(/shared app configuration/i)).not.toBeInTheDocument()
})

it('reports the active broker environment as the market-data credential source', () => {
  render(<SettingsPage />)

  const section = screen.getByRole('region', { name: /market data/i })
  expect(within(section).getByText('Using paper credentials')).toBeInTheDocument()
})

it('prompts to connect Alpaca for market data when no broker environment is active', () => {
  mockUseSettingsStatus.mockReturnValue({
    data: {
      marketData: 'missing' as const,
      alpacaPaper: 'missing' as const,
      alpacaLive: 'missing' as const,
      activeBrokerEnv: 'none' as const,
      alpacaPaperAccountNumberMasked: null,
      alpacaLiveAccountNumberMasked: null
    },
    isLoading: false,
    isError: false,
    error: null
  } as ReturnType<typeof useSettingsStatus>)

  render(<SettingsPage />)

  const section = screen.getByRole('region', { name: /market data/i })
  expect(
    within(section).getByText('Connect Alpaca below to enable market data')
  ).toBeInTheDocument()
  expect(within(section).queryByText(/^Using \w+ credentials$/)).not.toBeInTheDocument()
})

it('renders a Refresh IVR now button in the Market Data section', () => {
  render(<SettingsPage />)

  const section = screen.getByRole('region', { name: /market data/i })
  expect(within(section).getByRole('button', { name: /refresh ivr now/i })).toBeEnabled()
})

it('disables Refresh IVR now while a collection is in flight', () => {
  // [US-97] The run now covers every watchlist name at ~1s each, so the manual trigger
  // is where a human waits. (`scheduler.runNow` also joins an in-flight run, so even a
  // click from a fresh mount cannot launch a concurrent batch.)
  mockUseCollectIvrNow.mockReturnValue({
    mutateAsync: vi.fn(),
    isPending: true
  } as unknown as ReturnType<typeof useCollectIvrNow>)

  render(<SettingsPage />)

  const section = screen.getByRole('region', { name: /market data/i })
  expect(within(section).getByRole('button', { name: /refreshing ivr/i })).toBeDisabled()
  expect(
    within(section).queryByRole('button', { name: /refresh ivr now/i })
  ).not.toBeInTheDocument()
})

it('clicking Refresh IVR now surfaces the returned success and error counts', async () => {
  const collectIvrNow = vi.fn().mockResolvedValue({
    successCount: 2,
    errorCount: 1,
    skippedCount: 0,
    skippedReason: null
  })
  mockUseCollectIvrNow.mockReturnValue({
    mutateAsync: collectIvrNow
  } as unknown as ReturnType<typeof useCollectIvrNow>)

  render(<SettingsPage />)

  const section = screen.getByRole('region', { name: /market data/i })
  fireEvent.click(within(section).getByRole('button', { name: /refresh ivr now/i }))

  expect(collectIvrNow).toHaveBeenCalledTimes(1)
  expect(
    await within(section).findByText('IVR refresh complete: 2 snapshots saved, 1 errors.')
  ).toBeInTheDocument()
})

it('shows a skipped message when the collector reports market_closed', async () => {
  mockUseCollectIvrNow.mockReturnValue({
    mutateAsync: vi.fn().mockResolvedValue({
      successCount: 0,
      errorCount: 0,
      skippedCount: 0,
      skippedReason: 'market_closed'
    })
  } as unknown as ReturnType<typeof useCollectIvrNow>)

  render(<SettingsPage />)

  const section = screen.getByRole('region', { name: /market data/i })
  fireEvent.click(within(section).getByRole('button', { name: /refresh ivr now/i }))

  expect(
    await within(section).findByText('IVR refresh skipped: market closed on a non-trading day.')
  ).toHaveClass('text-wb-text-muted')
})

it('shows an error message when the IVR collect mutation rejects', async () => {
  mockUseCollectIvrNow.mockReturnValue({
    mutateAsync: vi.fn().mockRejectedValue(
      apiError(502, {
        detail: [{ field: 'general', code: 'broker_error', message: 'Broker request failed' }]
      })
    )
  } as unknown as ReturnType<typeof useCollectIvrNow>)

  render(<SettingsPage />)

  const section = screen.getByRole('region', { name: /market data/i })
  fireEvent.click(within(section).getByRole('button', { name: /refresh ivr now/i }))

  expect(await within(section).findByText('Broker request failed')).toHaveClass('text-wb-red')
})

it('renders Broker (Alpaca) with Paper and Live credential cards and the active environment control above them', () => {
  render(<SettingsPage />)

  const brokerSection = screen.getByRole('region', { name: /broker/i })
  expect(within(brokerSection).getAllByText(/active broker environment/i).length).toBeGreaterThan(0)
  expect(within(brokerSection).getByRole('radio', { name: /paper/i })).toBeInTheDocument()
  expect(within(brokerSection).getByRole('radio', { name: /live/i })).toBeInTheDocument()
  expect(within(brokerSection).getByText(/paper credentials/i)).toBeInTheDocument()
  expect(within(brokerSection).getAllByText(/live credentials/i).length).toBeGreaterThan(0)
  expect(within(brokerSection).getAllByLabelText(/api key id/i)).toHaveLength(2)
  expect(within(brokerSection).getAllByLabelText(/secret key/i)).toHaveLength(2)
  expect(within(brokerSection).getAllByRole('button', { name: /test connection/i })).toHaveLength(2)
})

it('empty state banner asks the trader to connect Alpaca when neither environment is saved', () => {
  mockUseSettingsStatus.mockReturnValue({
    data: {
      marketData: 'missing',
      alpacaPaper: 'missing',
      alpacaLive: 'missing',
      activeBrokerEnv: 'none',
      alpacaPaperAccountNumberMasked: null,
      alpacaLiveAccountNumberMasked: null
    },
    isLoading: false,
    isError: false,
    error: null
  } as ReturnType<typeof useSettingsStatus>)

  render(<SettingsPage />)

  expect(
    screen.getByText('Connect Alpaca to enable market data, buying power and broker activities.')
  ).toBeInTheDocument()
})

it('hides the empty state banner once either Alpaca environment is configured', () => {
  mockUseSettingsStatus.mockReturnValue({
    data: {
      marketData: 'missing',
      alpacaPaper: 'missing',
      alpacaLive: 'configured',
      activeBrokerEnv: 'none',
      alpacaPaperAccountNumberMasked: null,
      alpacaLiveAccountNumberMasked: 'AL…XYZ'
    },
    isLoading: false,
    isError: false,
    error: null
  } as ReturnType<typeof useSettingsStatus>)

  render(<SettingsPage />)

  expect(
    screen.queryByText('Connect Alpaca to enable market data, buying power and broker activities.')
  ).not.toBeInTheDocument()
})

it('leaves PAPER unchecked when no broker environment is active so first-time setup can promote paper', () => {
  mockUseSettingsStatus.mockReturnValue({
    data: {
      marketData: 'missing',
      alpacaPaper: 'configured',
      alpacaLive: 'missing',
      activeBrokerEnv: 'none',
      alpacaPaperAccountNumberMasked: 'PA…ABC',
      alpacaLiveAccountNumberMasked: null
    },
    isLoading: false,
    isError: false,
    error: null
  } as ReturnType<typeof useSettingsStatus>)

  render(<SettingsPage />)

  expect(screen.getByRole('radio', { name: /paper/i })).not.toBeChecked()
  expect(screen.getByRole('radio', { name: /live/i })).not.toBeChecked()
})

it('renders the exact Alpaca verified result for paper credentials', async () => {
  mockUseTestStoredAlpacaConnection.mockReturnValue({
    mutateAsync: vi.fn().mockResolvedValue({
      ok: true,
      vendor: 'alpaca',
      environment: 'paper',
      accountNumberMasked: 'PA…ABC'
    })
  } as unknown as ReturnType<typeof useTestStoredAlpacaConnection>)

  render(<SettingsPage />)

  const paperCard = screen.getByTestId('alpaca-card-paper')
  fireEvent.click(within(paperCard).getByRole('button', { name: /test connection/i }))

  expect(
    await within(paperCard).findByText('✓ Verified — Account PA…ABC (paper)')
  ).toBeInTheDocument()
})

it('configured Alpaca cards re-test stored credentials instead of faking success', async () => {
  const testStoredConnection = vi.fn().mockResolvedValue({
    ok: false,
    errorCode: 'auth_failed',
    message: 'Authentication failed (401)'
  })
  mockUseTestStoredAlpacaConnection.mockReturnValue({
    mutateAsync: testStoredConnection
  } as unknown as ReturnType<typeof useTestStoredAlpacaConnection>)

  render(<SettingsPage />)

  const paperCard = screen.getByTestId('alpaca-card-paper')
  fireEvent.click(within(paperCard).getByRole('button', { name: /test connection/i }))

  expect(testStoredConnection).toHaveBeenCalledWith({ environment: 'paper' })
  expect(await within(paperCard).findByText('Authentication failed (401)')).toHaveClass(
    'text-wb-red'
  )
})

it('paper-card mismatch message does not save credentials', async () => {
  const testConnection = vi.fn().mockResolvedValue({
    ok: false,
    errorCode: 'environment_mismatch',
    message: 'Environment mismatch — these are LIVE keys, not paper keys'
  })
  const saveAlpaca = vi.fn()
  mockUseTestSettingsConnection.mockReturnValue({
    mutateAsync: testConnection
  } as unknown as ReturnType<typeof useTestSettingsConnection>)
  mockUseSaveAlpacaCredentials.mockReturnValue({
    mutateAsync: saveAlpaca
  } as unknown as ReturnType<typeof useSaveAlpacaCredentials>)

  render(<SettingsPage />)

  const paperCard = screen.getByTestId('alpaca-card-paper')
  fireEvent.click(within(paperCard).getByRole('button', { name: /replace/i }))
  fireEvent.change(within(paperCard).getByLabelText(/api key id/i), {
    target: { value: 'AK_LIVE_KEY' }
  })
  fireEvent.change(within(paperCard).getByLabelText(/secret key/i), {
    target: { value: 'live-secret' }
  })
  fireEvent.click(within(paperCard).getByRole('button', { name: /test connection/i }))

  expect(
    await within(paperCard).findByText('Environment mismatch — these are LIVE keys, not paper keys')
  ).toBeInTheDocument()
  expect(saveAlpaca).not.toHaveBeenCalled()
})

it('post-save success message uses the freshly verified account number instead of placeholders', async () => {
  const saveAlpaca = vi.fn().mockResolvedValue({
    status: {
      ...statusFixture,
      alpacaPaperAccountNumberMasked: null
    },
    test: {
      ok: true,
      vendor: 'alpaca',
      environment: 'paper',
      accountNumberMasked: 'PA…FRESH'
    }
  })
  mockUseSettingsStatus.mockReturnValue({
    data: {
      ...statusFixture,
      alpacaPaper: 'missing',
      alpacaPaperAccountNumberMasked: null
    },
    isLoading: false,
    isError: false,
    error: null
  } as ReturnType<typeof useSettingsStatus>)
  mockUseSaveAlpacaCredentials.mockReturnValue({
    mutateAsync: saveAlpaca
  } as unknown as ReturnType<typeof useSaveAlpacaCredentials>)

  render(<SettingsPage />)

  const paperCard = screen.getByTestId('alpaca-card-paper')
  fireEvent.change(within(paperCard).getByLabelText(/api key id/i), {
    target: { value: 'PK_FRESH_KEY' }
  })
  fireEvent.change(within(paperCard).getByLabelText(/secret key/i), {
    target: { value: 'fresh-secret' }
  })
  fireEvent.submit(within(paperCard).getByRole('button', { name: /save/i }).closest('form')!)

  expect(
    await within(paperCard).findByText('✓ Verified — Account PA…FRESH (paper)')
  ).toBeInTheDocument()
  expect(within(paperCard).queryByText(/PA…ABC|AL…ZYX/)).not.toBeInTheDocument()
})

it('surfaces save failures from the Alpaca credential form', async () => {
  const saveAlpaca = vi.fn().mockRejectedValue(
    apiError(502, {
      detail: [{ field: 'keyId', code: 'auth_failed', message: 'Authentication failed (401)' }]
    })
  )
  mockUseSettingsStatus.mockReturnValue({
    data: {
      ...statusFixture,
      alpacaPaper: 'missing',
      alpacaPaperAccountNumberMasked: null
    },
    isLoading: false,
    isError: false,
    error: null
  } as ReturnType<typeof useSettingsStatus>)
  mockUseSaveAlpacaCredentials.mockReturnValue({
    mutateAsync: saveAlpaca
  } as unknown as ReturnType<typeof useSaveAlpacaCredentials>)

  render(<SettingsPage />)

  const paperCard = screen.getByTestId('alpaca-card-paper')
  fireEvent.change(within(paperCard).getByLabelText(/api key id/i), {
    target: { value: 'PK_BAD_KEY' }
  })
  fireEvent.change(within(paperCard).getByLabelText(/secret key/i), {
    target: { value: 'bad-secret' }
  })
  fireEvent.submit(within(paperCard).getByRole('button', { name: /save/i }).closest('form')!)

  expect(await within(paperCard).findByText('Authentication failed (401)')).toHaveClass(
    'text-wb-red'
  )
})

it('Alpaca paper Test Connection (unsaved credentials) surfaces IPC-level failures', async () => {
  const testConnection = vi.fn().mockRejectedValue(
    apiError(502, {
      detail: [{ field: '__root__', code: 'unknown', message: 'IPC channel unavailable' }]
    })
  )
  mockUseSettingsStatus.mockReturnValue({
    data: {
      ...statusFixture,
      alpacaPaper: 'missing',
      alpacaPaperAccountNumberMasked: null
    },
    isLoading: false,
    isError: false,
    error: null
  } as ReturnType<typeof useSettingsStatus>)
  mockUseTestSettingsConnection.mockReturnValue({
    mutateAsync: testConnection
  } as unknown as ReturnType<typeof useTestSettingsConnection>)

  render(<SettingsPage />)

  const paperCard = screen.getByTestId('alpaca-card-paper')
  fireEvent.change(within(paperCard).getByLabelText(/api key id/i), {
    target: { value: 'PK_KEY' }
  })
  fireEvent.change(within(paperCard).getByLabelText(/secret key/i), {
    target: { value: 'secret' }
  })
  fireEvent.click(within(paperCard).getByRole('button', { name: /test connection/i }))

  expect(await within(paperCard).findByText('IPC channel unavailable')).toHaveClass('text-wb-red')
})

it('Alpaca paper Test Connection (stored credentials) surfaces IPC-level failures', async () => {
  const testStoredConnection = vi.fn().mockRejectedValue(
    apiError(502, {
      detail: [{ field: '__root__', code: 'unknown', message: 'IPC channel unavailable' }]
    })
  )
  mockUseTestStoredAlpacaConnection.mockReturnValue({
    mutateAsync: testStoredConnection
  } as unknown as ReturnType<typeof useTestStoredAlpacaConnection>)

  render(<SettingsPage />)

  const paperCard = screen.getByTestId('alpaca-card-paper')
  fireEvent.click(within(paperCard).getByRole('button', { name: /test connection/i }))

  expect(await within(paperCard).findByText('IPC channel unavailable')).toHaveClass('text-wb-red')
})

it('disables LIVE switching until live credentials are configured', () => {
  render(<SettingsPage />)

  const liveRadio = screen.getByRole('radio', { name: /live/i })
  const setActiveBrokerEnvironment = mockUseSetActiveBrokerEnvironment.mock.results[0]?.value as {
    mutate: ReturnType<typeof vi.fn>
  }

  expect(liveRadio).toBeDisabled()
  expect(setActiveBrokerEnvironment.mutate).not.toHaveBeenCalled()
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  expect(screen.getByText(/save live credentials before switching/i)).toBeInTheDocument()
})

it('renders an Alert Defaults region showing the loaded profit target and management window', async () => {
  render(<SettingsPage />)

  const section = screen.getByRole('region', { name: /alert defaults/i })
  await waitFor(() => expect(within(section).getByLabelText(/profit target/i)).toHaveValue(50))
  expect(within(section).getByLabelText(/management window/i)).toHaveValue(21)
})

it('saves edited alert defaults and shows the saved banner', async () => {
  const mutate = vi.fn((_payload, opts?: { onSuccess?: () => void }) => opts?.onSuccess?.())
  mockUseSaveAlertDefaults.mockReturnValue({
    mutate
  } as unknown as ReturnType<typeof useSaveAlertDefaults>)

  render(<SettingsPage />)

  const section = screen.getByRole('region', { name: /alert defaults/i })
  fireEvent.change(within(section).getByLabelText(/profit target/i), { target: { value: '40' } })
  fireEvent.change(within(section).getByLabelText(/management window/i), {
    target: { value: '14' }
  })

  const saveButton = within(section).getByRole('button', { name: /save alert defaults/i })
  await waitFor(() => expect(saveButton).not.toBeDisabled())
  fireEvent.click(saveButton)

  await waitFor(() =>
    expect(mutate).toHaveBeenCalledWith(
      { profitTargetPercent: 40, managementWindowDte: 14 },
      expect.anything()
    )
  )
  expect(within(section).getByText(/alert defaults saved/i)).toBeInTheDocument()
})

it('shows inline validation errors and disables Save for out-of-range values, without calling the mutation', async () => {
  const mutate = vi.fn()
  mockUseSaveAlertDefaults.mockReturnValue({
    mutate
  } as unknown as ReturnType<typeof useSaveAlertDefaults>)

  render(<SettingsPage />)

  const section = screen.getByRole('region', { name: /alert defaults/i })
  fireEvent.change(within(section).getByLabelText(/profit target/i), { target: { value: '0' } })
  fireEvent.change(within(section).getByLabelText(/management window/i), {
    target: { value: '0' }
  })

  await waitFor(() =>
    expect(within(section).getByText(/profit target must be between 1 and 99/i)).toBeInTheDocument()
  )
  expect(
    within(section).getByText(/management window must be between 6 and 45 dte/i)
  ).toBeInTheDocument()
  expect(within(section).getByRole('button', { name: /save alert defaults/i })).toBeDisabled()
  expect(mutate).not.toHaveBeenCalled()
})

it('surfaces server-side field errors from a rejected save the same as client-side validation', async () => {
  const mutate = vi.fn((_payload, opts?: { onError?: (error: unknown) => void }) =>
    opts?.onError?.(
      apiError(400, {
        detail: [
          {
            field: 'profitTargetPercent',
            code: 'out_of_range',
            message: 'Profit target must be between 1 and 99'
          }
        ]
      })
    )
  )
  mockUseSaveAlertDefaults.mockReturnValue({
    mutate
  } as unknown as ReturnType<typeof useSaveAlertDefaults>)

  render(<SettingsPage />)

  const section = screen.getByRole('region', { name: /alert defaults/i })
  fireEvent.change(within(section).getByLabelText(/profit target/i), { target: { value: '40' } })
  fireEvent.change(within(section).getByLabelText(/management window/i), {
    target: { value: '14' }
  })

  const saveButton = within(section).getByRole('button', { name: /save alert defaults/i })
  await waitFor(() => expect(saveButton).not.toBeDisabled())
  fireEvent.click(saveButton)

  await waitFor(() =>
    expect(within(section).getByText(/profit target must be between 1 and 99/i)).toBeInTheDocument()
  )
})

// ── message tones, dead-end results, card actions, live switching ────────────

function statusWith(overrides: Partial<CredentialStatus>): ReturnType<typeof useSettingsStatus> {
  return {
    data: { ...statusFixture, ...overrides },
    isLoading: false,
    isError: false,
    error: null
  } as ReturnType<typeof useSettingsStatus>
}

const LIVE_CONFIGURED = {
  alpacaLive: 'configured' as const,
  alpacaLiveAccountNumberMasked: 'AL…XYZ'
}

const UNSAVED_PAPER = {
  alpacaPaper: 'missing' as const,
  alpacaPaperAccountNumberMasked: null,
  activeBrokerEnv: 'none' as const
}

function fillCredentialForm(card: HTMLElement, keyId: string): void {
  fireEvent.change(within(card).getByLabelText(/api key id/i), { target: { value: keyId } })
  fireEvent.change(within(card).getByLabelText(/secret key/i), { target: { value: 'secret' } })
}

it('shows a green IVR message when the refresh completes without errors', async () => {
  mockUseCollectIvrNow.mockReturnValue({
    mutateAsync: vi
      .fn()
      .mockResolvedValue({ successCount: 3, errorCount: 0, skippedCount: 0, skippedReason: null })
  } as unknown as ReturnType<typeof useCollectIvrNow>)

  render(<SettingsPage />)
  fireEvent.click(screen.getByRole('button', { name: /refresh ivr now/i }))

  expect(await screen.findByText('IVR refresh complete: 3 snapshots saved, 0 errors.')).toHaveClass(
    'text-wb-green'
  )
})

it.each([
  ['a non-object rejection', 'offline'],
  ['an Error without an API body', new Error('boom')],
  ['an API error with an empty detail list', apiError(502, { detail: [] })]
])('falls back to a generic IVR error message for %s', async (_label, rejection) => {
  mockUseCollectIvrNow.mockReturnValue({
    mutateAsync: vi.fn().mockRejectedValue(rejection)
  } as unknown as ReturnType<typeof useCollectIvrNow>)

  render(<SettingsPage />)
  fireEvent.click(screen.getByRole('button', { name: /refresh ivr now/i }))

  expect(await screen.findByText('Unable to complete the request')).toHaveClass('text-wb-red')
})

it('keeps the key hint when an unsaved Test connection resolves without a result', async () => {
  const testConnection = vi.fn().mockResolvedValue(undefined)
  mockUseSettingsStatus.mockReturnValue(statusWith(UNSAVED_PAPER))
  mockUseTestSettingsConnection.mockReturnValue({
    mutateAsync: testConnection
  } as unknown as ReturnType<typeof useTestSettingsConnection>)

  render(<SettingsPage />)
  const paperCard = screen.getByTestId('alpaca-card-paper')
  fillCredentialForm(paperCard, 'PK_KEY')
  fireEvent.click(within(paperCard).getByRole('button', { name: /test connection/i }))

  await waitFor(() =>
    expect(testConnection).toHaveBeenCalledWith({
      vendor: 'alpaca',
      environment: 'paper',
      keyId: 'PK_KEY',
      secret: 'secret'
    })
  )
  expect(within(paperCard).getByText(/generate keys at app\.alpaca\.markets/i)).toHaveClass(
    'text-wb-text-muted'
  )
})

it('shows the verified account in green when an unsaved Test connection succeeds', async () => {
  mockUseSettingsStatus.mockReturnValue(statusWith(UNSAVED_PAPER))
  mockUseTestSettingsConnection.mockReturnValue({
    mutateAsync: vi.fn().mockResolvedValue({
      ok: true,
      vendor: 'alpaca',
      environment: 'paper',
      accountNumberMasked: 'PA…NEW'
    })
  } as unknown as ReturnType<typeof useTestSettingsConnection>)

  render(<SettingsPage />)
  const paperCard = screen.getByTestId('alpaca-card-paper')
  fillCredentialForm(paperCard, 'PK_KEY')
  fireEvent.click(within(paperCard).getByRole('button', { name: /test connection/i }))

  expect(await within(paperCard).findByText('✓ Verified — Account PA…NEW (paper)')).toHaveClass(
    'text-wb-green'
  )
})

it('keeps the stored verification message when a stored Test connection resolves without a result', async () => {
  const testStored = vi.fn().mockResolvedValue(undefined)
  mockUseTestStoredAlpacaConnection.mockReturnValue({
    mutateAsync: testStored
  } as unknown as ReturnType<typeof useTestStoredAlpacaConnection>)

  render(<SettingsPage />)
  const paperCard = screen.getByTestId('alpaca-card-paper')
  fireEvent.click(within(paperCard).getByRole('button', { name: /test connection/i }))

  await waitFor(() => expect(testStored).toHaveBeenCalledWith({ environment: 'paper' }))
  expect(within(paperCard).getByText('✓ Verified — Account PA…ABC (paper)')).toBeInTheDocument()
})

it('shows the muted key hint for a configured card without a verified account number', () => {
  mockUseSettingsStatus.mockReturnValue(statusWith({ alpacaPaperAccountNumberMasked: null }))

  render(<SettingsPage />)

  const paperCard = screen.getByTestId('alpaca-card-paper')
  expect(within(paperCard).getByText(/generate keys at app\.alpaca\.markets/i)).toHaveClass(
    'text-wb-text-muted'
  )
})

it('Cancel returns a configured card from the Replace form to the masked view', () => {
  render(<SettingsPage />)
  const paperCard = screen.getByTestId('alpaca-card-paper')

  fireEvent.click(within(paperCard).getByRole('button', { name: /replace/i }))
  expect(within(paperCard).getByRole('button', { name: /^save$/i })).toBeInTheDocument()

  fireEvent.click(within(paperCard).getByRole('button', { name: /cancel/i }))
  expect(within(paperCard).queryByRole('button', { name: /^save$/i })).not.toBeInTheDocument()
  expect(within(paperCard).getByRole('button', { name: /replace/i })).toBeInTheDocument()
})

it('Remove asks the removal mutation to drop the card environment', () => {
  const remove = vi.fn().mockResolvedValue(undefined)
  mockUseRemoveAlpacaCredentials.mockReturnValue({
    mutateAsync: remove
  } as unknown as ReturnType<typeof useRemoveAlpacaCredentials>)
  mockUseSettingsStatus.mockReturnValue(statusWith(LIVE_CONFIGURED))

  render(<SettingsPage />)
  fireEvent.click(
    within(screen.getByTestId('alpaca-card-paper')).getByRole('button', { name: /remove/i })
  )
  fireEvent.click(
    within(screen.getByTestId('alpaca-card-live')).getByRole('button', { name: /remove/i })
  )

  expect(remove).toHaveBeenNthCalledWith(1, { environment: 'paper' })
  expect(remove).toHaveBeenNthCalledWith(2, { environment: 'live' })
})

it('the live card re-tests stored credentials for the live environment', async () => {
  const testStored = vi.fn().mockResolvedValue({
    ok: true,
    vendor: 'alpaca',
    environment: 'live',
    accountNumberMasked: 'AL…XYZ'
  })
  mockUseTestStoredAlpacaConnection.mockReturnValue({
    mutateAsync: testStored
  } as unknown as ReturnType<typeof useTestStoredAlpacaConnection>)
  mockUseSettingsStatus.mockReturnValue(statusWith(LIVE_CONFIGURED))

  render(<SettingsPage />)
  const liveCard = screen.getByTestId('alpaca-card-live')
  fireEvent.click(within(liveCard).getByRole('button', { name: /test connection/i }))

  expect(
    await within(liveCard).findByText('✓ Verified — Account AL…XYZ (live)')
  ).toBeInTheDocument()
  expect(testStored).toHaveBeenCalledWith({ environment: 'live' })
})

it('the live card tests and saves unsaved credentials for the live environment', async () => {
  const verified = {
    ok: true,
    vendor: 'alpaca',
    environment: 'live',
    accountNumberMasked: 'AL…NEW'
  }
  const testConnection = vi.fn().mockResolvedValue(verified)
  const save = vi
    .fn()
    .mockResolvedValue({ status: { ...statusFixture, ...LIVE_CONFIGURED }, test: verified })
  mockUseTestSettingsConnection.mockReturnValue({
    mutateAsync: testConnection
  } as unknown as ReturnType<typeof useTestSettingsConnection>)
  mockUseSaveAlpacaCredentials.mockReturnValue({
    mutateAsync: save
  } as unknown as ReturnType<typeof useSaveAlpacaCredentials>)

  render(<SettingsPage />)
  const liveCard = screen.getByTestId('alpaca-card-live')
  fillCredentialForm(liveCard, 'AK_KEY')

  fireEvent.click(within(liveCard).getByRole('button', { name: /test connection/i }))
  await waitFor(() =>
    expect(testConnection).toHaveBeenCalledWith({
      vendor: 'alpaca',
      environment: 'live',
      keyId: 'AK_KEY',
      secret: 'secret'
    })
  )

  fireEvent.click(within(liveCard).getByRole('button', { name: /^save$/i }))
  await waitFor(() =>
    expect(save).toHaveBeenCalledWith({ environment: 'live', keyId: 'AK_KEY', secret: 'secret' })
  )
  expect(
    await within(liveCard).findByText('✓ Verified — Account AL…NEW (live)')
  ).toBeInTheDocument()
})

it('selecting PAPER activates the paper environment immediately', () => {
  const mutate = vi.fn()
  mockUseSetActiveBrokerEnvironment.mockReturnValue({
    mutate
  } as unknown as ReturnType<typeof useSetActiveBrokerEnvironment>)
  mockUseSettingsStatus.mockReturnValue(statusWith({ activeBrokerEnv: 'none' }))

  render(<SettingsPage />)
  fireEvent.click(screen.getByRole('radio', { name: /paper/i }))

  expect(mutate).toHaveBeenCalledWith({ environment: 'paper' })
})

it('selecting LIVE asks for confirmation and only switches once confirmed', () => {
  const mutate = vi.fn()
  mockUseSetActiveBrokerEnvironment.mockReturnValue({
    mutate
  } as unknown as ReturnType<typeof useSetActiveBrokerEnvironment>)
  mockUseSettingsStatus.mockReturnValue(statusWith(LIVE_CONFIGURED))

  render(<SettingsPage />)

  fireEvent.click(screen.getByRole('radio', { name: /live/i }))
  fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: /^cancel$/i }))
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  expect(mutate).not.toHaveBeenCalled()

  fireEvent.click(screen.getByRole('radio', { name: /live/i }))
  fireEvent.click(
    within(screen.getByRole('dialog')).getByRole('button', { name: /switch to live/i })
  )
  expect(mutate).toHaveBeenCalledWith({ environment: 'live' })
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
})

it('highlights LIVE when the live environment is active', () => {
  mockUseSettingsStatus.mockReturnValue(statusWith({ ...LIVE_CONFIGURED, activeBrokerEnv: 'live' }))

  render(<SettingsPage />)

  const liveLabel = screen.getByRole('radio', { name: /live/i }).closest('label') as HTMLElement
  const paperLabel = screen.getByRole('radio', { name: /paper/i }).closest('label') as HTMLElement
  expect(within(liveLabel).getByText('LIVE')).toHaveClass('text-wb-green')
  expect(within(paperLabel).getByText('PAPER')).toHaveClass('text-wb-text-muted')
  expect(
    within(screen.getByRole('region', { name: /market data/i })).getByText('Using live credentials')
  ).toBeInTheDocument()
})

it('falls back to an unconfigured status while settings, positions and alert defaults are loading', () => {
  const loading = { data: undefined, isLoading: true, isError: false, error: null }
  mockUseSettingsStatus.mockReturnValue(loading as unknown as ReturnType<typeof useSettingsStatus>)
  mockUsePositions.mockReturnValue(loading as unknown as ReturnType<typeof usePositions>)
  mockUseAlertDefaults.mockReturnValue(loading as unknown as ReturnType<typeof useAlertDefaults>)

  render(<SettingsPage />)

  expect(
    screen.getByText(/connect alpaca to enable market data, buying power and broker activities/i)
  ).toBeInTheDocument()
  expect(screen.getByRole('radio', { name: /live/i })).toBeDisabled()

  const section = screen.getByRole('region', { name: /alert defaults/i })
  const profitTarget = within(section).getByLabelText(/profit target/i)
  expect(profitTarget).toHaveValue(50)
  fireEvent.change(profitTarget, { target: { value: '40' } })
  fireEvent.click(within(section).getByRole('button', { name: /reset/i }))
  expect(profitTarget).toHaveValue(40)
})

it('Reset restores the loaded alert defaults and clears the saved banner', async () => {
  const mutate = vi.fn((_payload, opts?: { onSuccess?: () => void }) => opts?.onSuccess?.())
  mockUseSaveAlertDefaults.mockReturnValue({
    mutate
  } as unknown as ReturnType<typeof useSaveAlertDefaults>)

  render(<SettingsPage />)
  const section = screen.getByRole('region', { name: /alert defaults/i })
  const profitTarget = within(section).getByLabelText(/profit target/i)

  fireEvent.change(profitTarget, { target: { value: '40' } })
  const saveButton = within(section).getByRole('button', { name: /save alert defaults/i })
  await waitFor(() => expect(saveButton).not.toBeDisabled())
  fireEvent.click(saveButton)
  expect(await within(section).findByText('Alert defaults saved')).toBeInTheDocument()

  fireEvent.change(profitTarget, { target: { value: '35' } })
  fireEvent.click(within(section).getByRole('button', { name: /reset/i }))

  expect(profitTarget).toHaveValue(50)
  expect(within(section).queryByText('Alert defaults saved')).not.toBeInTheDocument()
})

it('ignores rejected alert-default saves that carry no field errors', async () => {
  const mutate = vi.fn((_payload, opts?: { onError?: (error: unknown) => void }) =>
    opts?.onError?.(apiError(500, {}))
  )
  mockUseSaveAlertDefaults.mockReturnValue({
    mutate
  } as unknown as ReturnType<typeof useSaveAlertDefaults>)

  render(<SettingsPage />)
  const section = screen.getByRole('region', { name: /alert defaults/i })
  fireEvent.change(within(section).getByLabelText(/profit target/i), { target: { value: '40' } })
  const saveButton = within(section).getByRole('button', { name: /save alert defaults/i })
  await waitFor(() => expect(saveButton).not.toBeDisabled())
  fireEvent.click(saveButton)

  await waitFor(() => expect(mutate).toHaveBeenCalled())
  expect(within(section).queryByRole('alert')).not.toBeInTheDocument()
})
