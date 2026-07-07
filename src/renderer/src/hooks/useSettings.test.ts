import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  getAlertDefaults,
  getCredentialStatus,
  removeAlpacaCredentials,
  saveAlertDefaults,
  saveAlpacaCredentials,
  setActiveBrokerEnvironment,
  testStoredAlpacaConnection,
  testSettingsConnection
} from '../api/settings'
import { brokerQueryKeys } from './brokerQueryKeys'
import { marketDataQueryKeys } from './marketDataQueryKeys'
import { settingsQueryKeys } from './settingsQueryKeys'
import {
  useAlertDefaults,
  useRemoveAlpacaCredentials,
  useSaveAlertDefaults,
  useSaveAlpacaCredentials,
  useSetActiveBrokerEnvironment,
  useSettingsStatus,
  useTestStoredAlpacaConnection,
  useTestSettingsConnection
} from './useSettings'

const { mockUseMutation, mockUseQuery, mockUseQueryClient, mockInvalidateQueries } = vi.hoisted(
  () => ({
    mockUseMutation: vi.fn(),
    mockUseQuery: vi.fn(),
    mockUseQueryClient: vi.fn(),
    mockInvalidateQueries: vi.fn()
  })
)

vi.mock('@tanstack/react-query', () => ({
  useMutation: mockUseMutation,
  useQuery: mockUseQuery,
  useQueryClient: mockUseQueryClient
}))

vi.mock('../api/settings', () => ({
  getCredentialStatus: vi.fn(),
  saveAlpacaCredentials: vi.fn(),
  removeAlpacaCredentials: vi.fn(),
  setActiveBrokerEnvironment: vi.fn(),
  testStoredAlpacaConnection: vi.fn(),
  testSettingsConnection: vi.fn(),
  getAlertDefaults: vi.fn(),
  saveAlertDefaults: vi.fn()
}))

function expectBrokerOnlyInvalidation(
  predicate: ((query: { queryKey: readonly unknown[] }) => boolean) | undefined
): void {
  expect(predicate).toEqual(expect.any(Function))
  expect(predicate?.({ queryKey: brokerQueryKeys.account })).toBe(true)
  expect(predicate?.({ queryKey: brokerQueryKeys.marketStatus })).toBe(true)
  expect(predicate?.({ queryKey: marketDataQueryKeys.stockQuotes(['AAPL']) })).toBe(false)
}

describe('useSettings hooks', () => {
  beforeEach(() => {
    mockInvalidateQueries.mockReset()
    mockUseMutation.mockReset()
    mockUseQuery.mockReset()
    mockUseQueryClient.mockReset()

    mockUseQueryClient.mockReturnValue({
      invalidateQueries: mockInvalidateQueries
    })
    mockUseMutation.mockImplementation((options) => options)
    mockUseQuery.mockImplementation((options) => options)
  })

  it('useSettingsStatus queries with settingsQueryKeys.status', () => {
    useSettingsStatus()

    expect(mockUseQuery).toHaveBeenCalledOnce()
    const [options] = mockUseQuery.mock.calls[0] as [
      { queryKey: typeof settingsQueryKeys.status; queryFn: typeof getCredentialStatus }
    ]

    expect(options.queryKey).toEqual(settingsQueryKeys.status)
    expect(options.queryFn).toBe(getCredentialStatus)
  })

  it('setActiveBrokerEnvironment invalidates only queries whose first key segment is broker', () => {
    useSetActiveBrokerEnvironment()

    const [options] = mockUseMutation.mock.calls[0] as [
      { mutationFn: typeof setActiveBrokerEnvironment; onSuccess?: (data: unknown) => void }
    ]

    expect(options.mutationFn).toBe(setActiveBrokerEnvironment)
    options.onSuccess?.({})

    const [brokerInvalidation, settingsRefresh] = mockInvalidateQueries.mock.calls as Array<
      [{ predicate?: (query: { queryKey: readonly unknown[] }) => boolean; queryKey?: unknown }]
    >

    expectBrokerOnlyInvalidation(brokerInvalidation[0].predicate)
    expect(settingsRefresh[0]).toEqual({ queryKey: settingsQueryKeys.status })
  })

  it('saveAlpacaCredentials invalidates only queries whose first key segment is broker', () => {
    useSaveAlpacaCredentials()

    const [options] = mockUseMutation.mock.calls[0] as [
      { mutationFn: typeof saveAlpacaCredentials; onSuccess?: (data: unknown) => void }
    ]

    expect(options.mutationFn).toBe(saveAlpacaCredentials)
    options.onSuccess?.({})

    const [brokerInvalidation, settingsRefresh] = mockInvalidateQueries.mock.calls as Array<
      [{ predicate?: (query: { queryKey: readonly unknown[] }) => boolean; queryKey?: unknown }]
    >

    expectBrokerOnlyInvalidation(brokerInvalidation[0].predicate)
    expect(settingsRefresh[0]).toEqual({ queryKey: settingsQueryKeys.status })
  })

  it('removeAlpacaCredentials refreshes settings status after success', () => {
    useRemoveAlpacaCredentials()

    const [options] = mockUseMutation.mock.calls[0] as [
      { mutationFn: typeof removeAlpacaCredentials; onSuccess?: (data: unknown) => void }
    ]

    expect(options.mutationFn).toBe(removeAlpacaCredentials)
    options.onSuccess?.({})

    expect(mockInvalidateQueries).toHaveBeenCalledWith({
      queryKey: settingsQueryKeys.status
    })
  })

  it('useTestSettingsConnection uses the testSettingsConnection API without invalidation', () => {
    useTestSettingsConnection()

    const [options] = mockUseMutation.mock.calls[0] as [
      { mutationFn: typeof testSettingsConnection; onSuccess?: (data: unknown) => void }
    ]

    expect(options.mutationFn).toBe(testSettingsConnection)
    options.onSuccess?.({})
    expect(mockInvalidateQueries).not.toHaveBeenCalled()
  })

  it('useTestStoredAlpacaConnection uses the stored-credential API without invalidation', () => {
    useTestStoredAlpacaConnection()

    const [options] = mockUseMutation.mock.calls[0] as [
      { mutationFn: typeof testStoredAlpacaConnection; onSuccess?: (data: unknown) => void }
    ]

    expect(options.mutationFn).toBe(testStoredAlpacaConnection)
    options.onSuccess?.({})
    expect(mockInvalidateQueries).not.toHaveBeenCalled()
  })

  it('useAlertDefaults queries with settingsQueryKeys.alertDefaults', () => {
    useAlertDefaults()

    expect(mockUseQuery).toHaveBeenCalledOnce()
    const [options] = mockUseQuery.mock.calls[0] as [
      { queryKey: typeof settingsQueryKeys.alertDefaults; queryFn: typeof getAlertDefaults }
    ]

    expect(options.queryKey).toEqual(settingsQueryKeys.alertDefaults)
    expect(options.queryFn).toBe(getAlertDefaults)
  })

  it('useSaveAlertDefaults invalidates settingsQueryKeys.alertDefaults after success', () => {
    useSaveAlertDefaults()

    const [options] = mockUseMutation.mock.calls[0] as [
      { mutationFn: typeof saveAlertDefaults; onSuccess?: (data: unknown) => void }
    ]

    expect(options.mutationFn).toBe(saveAlertDefaults)
    options.onSuccess?.({})
    expect(mockInvalidateQueries).toHaveBeenCalledWith({
      queryKey: settingsQueryKeys.alertDefaults
    })
  })
})
