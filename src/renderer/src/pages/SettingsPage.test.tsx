import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, vi } from 'vitest'
import { SettingsPage } from './SettingsPage'
import { apiError } from '../api/error'
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
