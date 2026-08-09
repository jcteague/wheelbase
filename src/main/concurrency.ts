/** Maps `items` through `fn` with at most `limit` calls in flight. An unbounded
 *  fan-out over a large batch bursts enough simultaneous requests to earn a 429
 *  from a healthy provider, so every multi-item provider read goes through here. */
export async function mapWithConcurrency<T, R>(
  items: readonly T[],
  limit: number,
  fn: (item: T) => Promise<R>
): Promise<R[]> {
  const results: R[] = new Array<R>(items.length)
  let cursor = 0
  const worker = async (): Promise<void> => {
    while (cursor < items.length) {
      const index = cursor
      cursor += 1
      results[index] = await fn(items[index])
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker))
  return results
}
