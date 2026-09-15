import {
  useMutation,
  useQuery,
  useQueryClient,
  type Query,
  type UseMutationResult,
  type UseQueryResult
} from '@tanstack/react-query'
import {
  getAlertDefaults,
  getCredentialStatus,
  removeAlpacaCredentials,
  saveAlertDefaults,
  saveAlpacaCredentials,
  setActiveBrokerEnvironment,
  testStoredAlpacaConnection,
  testSettingsConnection,
  type AlertDefaults,
  type ApiError,
  type CredentialStatus,
  type RemoveAlpacaCredentialsPayload,
  type SaveAlertDefaultsPayload,
  type SaveAlpacaCredentialsPayload,
  type SaveAlpacaCredentialsResult,
  type SetActiveBrokerEnvironmentPayload,
  type TestStoredAlpacaConnectionPayload,
  type TestSettingsConnectionPayload,
  type TestSettingsConnectionResult
} from '../api/settings'
import { settingsQueryKeys } from './settingsQueryKeys'

// A credential change invalidates every vendor-backed read, quotes included: the same
// Alpaca key pair answers the account, the session and the market data behind it.
function hasVendorQueryKey(query: Pick<Query, 'queryKey'>): boolean {
  return query.queryKey[0] === 'broker' || query.queryKey[0] === 'market'
}

function useBrokerSettingsMutation<TResult, TPayload>(
  mutationFn: (payload: TPayload) => Promise<TResult>
): UseMutationResult<TResult, ApiError, TPayload> {
  const queryClient = useQueryClient()

  return useMutation<TResult, ApiError, TPayload>({
    mutationFn,
    onSuccess: () => {
      queryClient.invalidateQueries({ predicate: hasVendorQueryKey })
      queryClient.invalidateQueries({ queryKey: settingsQueryKeys.status })
    }
  })
}

export function useSettingsStatus(): UseQueryResult<CredentialStatus, ApiError> {
  return useQuery<CredentialStatus, ApiError>({
    queryKey: settingsQueryKeys.status,
    queryFn: getCredentialStatus
  })
}

export function useSaveAlpacaCredentials(): UseMutationResult<
  SaveAlpacaCredentialsResult,
  ApiError,
  SaveAlpacaCredentialsPayload
> {
  return useBrokerSettingsMutation(saveAlpacaCredentials)
}

export function useRemoveAlpacaCredentials(): UseMutationResult<
  CredentialStatus,
  ApiError,
  RemoveAlpacaCredentialsPayload
> {
  return useBrokerSettingsMutation<CredentialStatus, RemoveAlpacaCredentialsPayload>(
    removeAlpacaCredentials
  )
}

export function useSetActiveBrokerEnvironment(): UseMutationResult<
  CredentialStatus,
  ApiError,
  SetActiveBrokerEnvironmentPayload
> {
  return useBrokerSettingsMutation<CredentialStatus, SetActiveBrokerEnvironmentPayload>(
    setActiveBrokerEnvironment
  )
}

export function useTestSettingsConnection(): UseMutationResult<
  TestSettingsConnectionResult,
  ApiError,
  TestSettingsConnectionPayload
> {
  return useMutation<TestSettingsConnectionResult, ApiError, TestSettingsConnectionPayload>({
    mutationFn: testSettingsConnection
  })
}

export function useTestStoredAlpacaConnection(): UseMutationResult<
  TestSettingsConnectionResult,
  ApiError,
  TestStoredAlpacaConnectionPayload
> {
  return useMutation<TestSettingsConnectionResult, ApiError, TestStoredAlpacaConnectionPayload>({
    mutationFn: testStoredAlpacaConnection
  })
}

export function useAlertDefaults(): UseQueryResult<AlertDefaults, ApiError> {
  return useQuery<AlertDefaults, ApiError>({
    queryKey: settingsQueryKeys.alertDefaults,
    queryFn: getAlertDefaults
  })
}

export function useSaveAlertDefaults(): UseMutationResult<
  AlertDefaults,
  ApiError,
  SaveAlertDefaultsPayload
> {
  const queryClient = useQueryClient()

  return useMutation<AlertDefaults, ApiError, SaveAlertDefaultsPayload>({
    mutationFn: saveAlertDefaults,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: settingsQueryKeys.alertDefaults })
  })
}
