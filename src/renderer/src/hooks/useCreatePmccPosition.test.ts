import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook } from '@testing-library/react'
import { createElement } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type {
  CreatePmccPositionPayload,
  CreatePmccPositionResponse,
  PmccListItem,
  PositionListItem
} from '../api/positions'
import { AAPL, MSFT, NVDA, XYZ_BACKGROUND } from '../test-fixtures/wheel-cards'
import { positionQueryKeys } from './positionQueryKeys'
import { useCreatePmccPosition } from './useCreatePmccPosition'

const mockCreatePmccPosition = vi.fn()

const PAYLOAD: CreatePmccPositionPayload = {
  strategy: 'PMCC',
  ticker: 'XYZ',
  long: {
    underlying: 'XYZ',
    instrumentType: 'CALL',
    deliverableShares: 100,
    strike: 80,
    expiration: '2027-09-17',
    contracts: 1,
    fillPrice: 25,
    fillDate: '2026-11-06',
    fees: 0
  },
  short: {
    underlying: 'XYZ',
    instrumentType: 'CALL',
    deliverableShares: 100,
    strike: 108,
    expiration: '2026-11-20',
    contracts: 1,
    fillPrice: 1.8,
    fillDate: '2026-11-06',
    fees: 0
  }
}

/** The service's list row for the new position: management window 30, earnings 2026-11-18. */
const LIST_ITEM: PmccListItem = {
  ...XYZ_BACKGROUND,
  id: 'pos-new',
  nextEarnings: '2026-11-18',
  pmcc: { ...XYZ_BACKGROUND.pmcc, managementWindowDte: 30 }
}

function pmccResponse(listItem: PmccListItem | null): CreatePmccPositionResponse {
  const leg = {
    id: 'leg-l',
    positionId: 'pos-new',
    strike: '80.0000',
    expiration: '2027-09-17',
    contracts: 1,
    premiumPerContract: '25.0000',
    fillPrice: '25.0000',
    fillDate: '2026-11-06',
    rollChainId: null,
    fees: '0.0000',
    createdAt: 'now',
    updatedAt: 'now'
  }
  return {
    position: {
      id: 'pos-new',
      ticker: 'XYZ',
      phase: 'PMCC_OPEN',
      status: 'ACTIVE',
      strategyType: 'PMCC',
      openedDate: '2026-11-06',
      closedDate: null,
      accountId: null,
      notes: null,
      thesis: null,
      tags: [],
      profitTargetPercent: null,
      managementWindowDteOverride: null,
      createdAt: 'now',
      updatedAt: 'now'
    },
    longLeg: { ...leg, legRole: 'LEAPS_OPEN', action: 'BUY', instrumentType: 'CALL' },
    shortLeg: {
      ...leg,
      id: 'leg-s',
      legRole: 'SHORT_CALL_OPEN',
      action: 'SELL',
      instrumentType: 'CALL',
      strike: '108.0000',
      expiration: '2026-11-20',
      premiumPerContract: '1.8000',
      fillPrice: '1.8000'
    },
    costBasisSnapshot: {
      id: 'snap-new',
      positionId: 'pos-new',
      basisPerShare: '23.2000',
      totalPremiumCollected: '180.0000',
      finalPnl: null,
      triggerEvent: 'PMCC_OPEN',
      snapshotAt: '2026-11-06T00:00:00.000Z',
      createdAt: 'now'
    },
    openingDebit: {
      leapsCost: '2500.0000',
      shortCredit: '180.0000',
      fees: '0.0000',
      initialNetDebit: '2320.0000',
      netDebitBeforeFees: '2320.0000',
      basisPerShare: '23.2000',
      strikeWidthPerShare: '28.0000',
      debitToWidthPercent: '82.8571'
    },
    listItem
  }
}

function renderWithCache(cached: PositionListItem[] | undefined): {
  queryClient: QueryClient
  mutate: () => Promise<CreatePmccPositionResponse>
} {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  if (cached) queryClient.setQueryData(positionQueryKeys.all, cached)
  const { result } = renderHook(() => useCreatePmccPosition(), {
    wrapper: ({ children }) => createElement(QueryClientProvider, { client: queryClient }, children)
  })
  return { queryClient, mutate: () => result.current.mutateAsync(PAYLOAD) }
}

describe('useCreatePmccPosition', () => {
  beforeEach(() => {
    mockCreatePmccPosition.mockReset()
    Object.assign(window, {
      api: { ...(window.api ?? {}), createPmccPosition: mockCreatePmccPosition }
    })
  })

  it('slots the response’s list item into the cached list in list order, without refetching', async () => {
    mockCreatePmccPosition.mockResolvedValue({ ok: true, ...pmccResponse(LIST_ITEM) })
    const { queryClient, mutate } = renderWithCache([MSFT, AAPL, NVDA])

    await act(mutate)

    // The new PMCC's 14-DTE short sorts it between MSFT (10) and AAPL (30).
    const list = queryClient.getQueryData<PositionListItem[]>(positionQueryKeys.all)
    expect(list?.map((item) => item.id)).toEqual([MSFT.id, 'pos-new', AAPL.id, NVDA.id])
    expect(list?.[1]).toEqual(LIST_ITEM)
    expect(queryClient.getQueryState(positionQueryKeys.all)?.isInvalidated).toBe(false)
  })

  it('leaves the cache empty when the list has never been loaded', async () => {
    mockCreatePmccPosition.mockResolvedValue({ ok: true, ...pmccResponse(LIST_ITEM) })
    const { queryClient, mutate } = renderWithCache(undefined)

    await act(mutate)

    expect(queryClient.getQueryData(positionQueryKeys.all)).toBeUndefined()
  })

  it('leaves the cached list alone when the service built no list item (the list omits it too)', async () => {
    mockCreatePmccPosition.mockResolvedValue({ ok: true, ...pmccResponse(null) })
    const cached = [MSFT, AAPL]
    const { queryClient, mutate } = renderWithCache(cached)

    await act(mutate)

    expect(queryClient.getQueryData(positionQueryKeys.all)).toBe(cached)
  })
})
