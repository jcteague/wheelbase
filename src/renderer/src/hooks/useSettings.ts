import {
  useMutation,
  useQuery,
  useQueryClient,
  type Query,
  type UseMutationResult,
  type UseQueryResult
} from '@tanstack/react-query'
import {
  getCredentialStatus,
  removeAlpacaCredentials,
  saveAlpacaCredentials,
  setActiveBrokerEnvironment,
  testSettingsConnection,
  type ApiError,
  type CredentialStatus,
  type RemoveAlpacaCredentialsPayload,
  type SaveAlpacaCredentialsPayload,
  type SetActiveBrokerEnvironmentPayload,
  type TestSettingsConnectionPayload,
  type TestSettingsConnectionResult
} from '../api/settings'
import { settingsQueryKeys } from './settingsQueryKeys'

function hasBrokerQueryKey(query: Pick<Query, 'queryKey'>): boolean {
  return query.queryKey[0] === 'broker'
}

function useBrokerSettingsMutation<TPayload>(
  mutationFn: (payload: TPayload) => Promise<CredentialStatus>
): UseMutationResult<CredentialStatus, ApiError, TPayload> {
  const queryClient = useQueryClient()

  return useMutation<CredentialStatus, ApiError, TPayload>({
    mutationFn,
    onSuccess: () => {
      queryClient.invalidateQueries({ predicate: hasBrokerQueryKey })
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
  CredentialStatus,
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
  return useBrokerSettingsMutation(removeAlpacaCredentials)
}

export function useSetActiveBrokerEnvironment(): UseMutationResult<
  CredentialStatus,
  ApiError,
  SetActiveBrokerEnvironmentPayload
> {
  return useBrokerSettingsMutation(setActiveBrokerEnvironment)
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
