export const brokerQueryKeys = {
  all: ['broker'] as const,
  account: ['broker', 'account'] as const,
  marketStatus: ['broker', 'market-status'] as const,
  activities: ({ type, since }: { type: string; since?: string }) =>
    ['broker', 'activities', type, since ?? ''] as const
}
