export const positionQueryKeys = {
  all: ['positions'] as const,
  detail: (id: string) => ['positions', id] as const
}
