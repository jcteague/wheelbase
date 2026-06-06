import { fireEvent, render, screen, within } from '@testing-library/react'
import { beforeEach, vi } from 'vitest'
import { SettingsPage } from './SettingsPage'
import {
  useRemoveAlpacaCredentials,
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
  useTestSettingsConnection: vi.fn()
}))

vi.mock('../hooks/usePositions', () => ({
  usePositions: vi.fn()
}))

const mockUseSettingsStatus = vi.mocked(useSettingsStatus)
const mockUseSaveAlpacaCredentials = vi.mocked(useSaveAlpacaCredentials)
const mockUseRemoveAlpacaCredentials = vi.mocked(useRemoveAlpacaCredentials)
const mockUseSetActiveBrokerEnvironment = vi.mocked(useSetActiveBrokerEnvironment)
const mockUseTestStoredAlpacaConnection = vi.mocked(useTestStoredAlpacaConnection)
const mockUseTestSettingsConnection = vi.mocked(useTestSettingsConnection)
const mockUsePositions = vi.mocked(usePositions)

const statusFixture = {
  massive: 'configured' as const,
  alpacaPaper: 'configured' as const,
  alpacaLive: 'missing' as const,
  activeBrokerEnv: 'paper' as const,
  massiveLastCheckedAt: '2026-05-28T14:14:00.000Z',
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
})

it('renders Market Data (Massive) as shared app status with a Test connection button and no key input', () => {
  render(<SettingsPage />)

  const section = screen.getByRole('region', { name: /market data/i })
  expect(within(section).getByText(/shared app configuration/i)).toBeInTheDocument()
  expect(within(section).getByRole('button', { name: /test connection/i })).toBeInTheDocument()
  expect(within(section).queryByLabelText(/api key id/i)).not.toBeInTheDocument()
  expect(
    within(section).queryByPlaceholderText(/paste your massive api key/i)
  ).not.toBeInTheDocument()
})

it('renders Broker (Alpaca) with Paper and Live credential cards and the active environment control above them', () => {
  render(<SettingsPage />)

  const brokerSection = screen.getByRole('region', { name: /broker/i })
  expect(within(brokerSection).getAllByText(/active broker environment/i).length).toBeGreaterThan(0)
  expect(within(brokerSection).getByRole('radio', { name: /paper/i })).toBeInTheDocument()
  expect(within(brokerSection).getByRole('radio', { name: /live/i })).toBeInTheDocument()
  expect(within(brokerSection).getByText(/paper credentials/i)).toBeInTheDocument()
  expect(within(brokerSection).getByText(/live credentials/i)).toBeInTheDocument()
  expect(within(brokerSection).getAllByLabelText(/api key id/i)).toHaveLength(2)
  expect(within(brokerSection).getAllByLabelText(/secret key/i)).toHaveLength(2)
  expect(within(brokerSection).getAllByRole('button', { name: /test connection/i })).toHaveLength(2)
})

it('empty state banner explains Massive is app-provided and Alpaca setup is optional', () => {
  mockUseSettingsStatus.mockReturnValue({
    data: {
      massive: 'missing',
      alpacaPaper: 'missing',
      alpacaLive: 'missing',
      activeBrokerEnv: 'none',
      massiveLastCheckedAt: null,
      alpacaPaperAccountNumberMasked: null,
      alpacaLiveAccountNumberMasked: null
    },
    isLoading: false,
    isError: false,
    error: null
  } as ReturnType<typeof useSettingsStatus>)

  render(<SettingsPage />)

  expect(
    screen.getByText(/massive provides data; alpaca provides your account/i)
  ).toBeInTheDocument()
  expect(screen.getByText(/both are optional/i)).toBeInTheDocument()
})

it('renders exact Massive auth and rate-limit messages in red', async () => {
  const testConnection = vi
    .fn()
    .mockResolvedValueOnce({
      ok: false,
      errorCode: 'auth_failed',
      message: 'Authentication failed (401)'
    })
    .mockResolvedValueOnce({
      ok: false,
      errorCode: 'rate_limited',
      message: 'Rate limited — please try again'
    })
  mockUseTestSettingsConnection.mockReturnValue({
    mutateAsync: testConnection
  } as unknown as ReturnType<typeof useTestSettingsConnection>)

  render(<SettingsPage />)

  const section = screen.getByRole('region', { name: /market data/i })
  fireEvent.click(within(section).getByRole('button', { name: /^test connection$/i }))
  expect(await screen.findByText('Authentication failed (401)')).toHaveClass('text-wb-red')

  fireEvent.click(within(section).getByRole('button', { name: /^test connection$/i }))
  expect(await screen.findByText('Rate limited — please try again')).toHaveClass('text-wb-red')
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
