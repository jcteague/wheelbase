import type { JSX } from 'preact';
import { PositionCard } from '../components/PositionCard';
import { usePositions } from '../hooks/usePositions';

export function PositionsListPage(): JSX.Element {
  const { data, isLoading, isError } = usePositions();

  return (
    <div class="min-h-screen bg-zinc-950">
      {/* Header */}
      <header class="border-b border-zinc-800 px-6 py-5">
        <div class="mx-auto max-w-5xl flex items-baseline gap-4">
          <h1
            class="text-2xl font-black tracking-tight text-zinc-100"
            style="font-family: 'Syne', sans-serif;"
          >
            WHEELBASE
          </h1>
          <span class="text-xs font-mono text-zinc-500 tracking-widest uppercase">
            Positions
          </span>
        </div>
      </header>

      <main class="mx-auto max-w-5xl px-6 py-8">
        {isLoading && (
          <div class="flex items-center gap-3 text-zinc-500">
            <span class="inline-block h-1.5 w-1.5 rounded-full bg-amber-500 animate-pulse" />
            <span class="text-sm font-mono tracking-wide">Loading positions…</span>
          </div>
        )}

        {isError && (
          <div class="rounded border border-red-900/50 bg-red-950/30 px-4 py-3 text-sm text-red-400 font-mono">
            Failed to load positions — check that the backend is running.
          </div>
        )}

        {!isLoading && !isError && (!data || data.length === 0) && (
          <div class="flex flex-col items-start gap-4 py-16">
            <p class="text-zinc-500 text-sm font-mono">No positions yet</p>
            <a
              href="/"
              class="text-xs font-mono tracking-widest uppercase text-amber-500 hover:text-amber-400 transition-colors border border-amber-500/30 hover:border-amber-500/60 px-4 py-2 rounded"
            >
              Open your first wheel →
            </a>
          </div>
        )}

        {data && data.length > 0 && (
          <div class="flex flex-col gap-3">
            {data.map((item, i) => (
              <div
                key={item.id}
                style={{ animationDelay: `${i * 60}ms` }}
                class="animate-in fade-in slide-in-from-bottom-2 duration-300 fill-mode-both"
              >
                <PositionCard item={item} />
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
