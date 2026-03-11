import { PositionCard } from '../components/PositionCard'
import { usePositions } from '../hooks/usePositions'

const STAGGER_DELAY_MS = 60

export function PositionsListPage(): React.JSX.Element {
  const { data, isLoading, isError } = usePositions()

  return (
    <div className="min-h-screen bg-zinc-950">
      <header className="border-b border-zinc-800 px-6 py-5">
        <div className="mx-auto max-w-5xl flex items-baseline gap-4">
          <h1
            className="text-2xl font-black tracking-tight text-zinc-100"
            style={{ fontFamily: "'Syne', sans-serif" }}
          >
            WHEELBASE
          </h1>
          <span className="text-xs font-mono text-zinc-500 tracking-widest uppercase">
            Positions
          </span>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-6 py-8">
        {isLoading && (
          <div className="flex items-center gap-3 text-zinc-500">
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-amber-500 animate-pulse" />
            <span className="text-sm font-mono tracking-wide">Loading positions…</span>
          </div>
        )}

        {isError && (
          <div className="rounded border border-red-900/50 bg-red-950/30 px-4 py-3 text-sm text-red-400 font-mono">
            Failed to load positions — check that the backend is running.
          </div>
        )}

        {!isLoading && !isError && (!data || data.length === 0) && (
          <div className="flex flex-col items-start gap-4 py-16">
            <p className="text-zinc-500 text-sm font-mono">No positions yet</p>
            <a
              href="/"
              className="text-xs font-mono tracking-widest uppercase text-amber-500 hover:text-amber-400 transition-colors border border-amber-500/30 hover:border-amber-500/60 px-4 py-2 rounded"
            >
              Open your first wheel →
            </a>
          </div>
        )}

        {data && data.length > 0 && (
          <div className="flex flex-col gap-3">
            {data.map((item, i) => (
              <div
                key={item.id}
                style={{ animationDelay: `${i * STAGGER_DELAY_MS}ms` }}
                className="animate-in fade-in slide-in-from-bottom-2 duration-300 fill-mode-both"
              >
                <PositionCard item={item} />
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  )
}
