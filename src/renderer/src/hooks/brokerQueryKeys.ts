export const brokerQueryKeys = {
  all: ['broker'] as const,
  account: ['broker', 'account'] as const,
  activities: ({ type, since }: { type: string; since?: string }) =>
    ['broker', 'activities', type, since ?? ''] as const
}
