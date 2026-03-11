import type { JSX } from 'preact';
import type { PositionListItem, WheelPhase } from '../api/positions';

function formatCurrency(value: string): string {
  return `$${parseFloat(value).toFixed(2)}`;
}

/** Colors used for the left border accent and phase badge — keyed by phase. */
const PHASE_COLOR: Record<WheelPhase, string> = {
  CSP_OPEN:          '#f59e0b', // amber-500
  CSP_EXPIRED:       '#71717a', // zinc-500
  CSP_CLOSED_PROFIT: '#10b981', // emerald-500
  CSP_CLOSED_LOSS:   '#ef4444', // red-500
  HOLDING_SHARES:    '#38bdf8', // sky-400
  CC_OPEN:           '#a78bfa', // violet-400
  CC_EXPIRED:        '#71717a', // zinc-500
  CC_CLOSED_PROFIT:  '#10b981', // emerald-500
  CC_CLOSED_LOSS:    '#ef4444', // red-500
  WHEEL_COMPLETE:    '#34d399', // emerald-400
};

const PHASE_LABEL: Record<WheelPhase, string> = {
  CSP_OPEN:          'CSP Open',
  CSP_EXPIRED:       'CSP Expired',
  CSP_CLOSED_PROFIT: 'CSP Closed +',
  CSP_CLOSED_LOSS:   'CSP Closed −',
  HOLDING_SHARES:    'Holding Shares',
  CC_OPEN:           'CC Open',
  CC_EXPIRED:        'CC Expired',
  CC_CLOSED_PROFIT:  'CC Closed +',
  CC_CLOSED_LOSS:    'CC Closed −',
  WHEEL_COMPLETE:    'Complete',
};

type Props = { item: PositionListItem };

export function PositionCard({ item }: Props): JSX.Element {
  const color = PHASE_COLOR[item.phase];
  const dteUrgent = item.dte !== null && item.dte <= 7;

  return (
    <article
      className="relative rounded-r-lg overflow-hidden cursor-pointer transition-colors duration-150 hover:brightness-110"
      style={{
        background: 'rgb(24 24 27)',          // zinc-900
        borderTop: '1px solid rgb(39 39 42)',  // zinc-800
        borderRight: '1px solid rgb(39 39 42)',
        borderBottom: '1px solid rgb(39 39 42)',
        borderLeft: `4px solid ${color}`,
      }}
    >
      <div className="px-5 py-4">
        {/* Top row */}
        <div className="flex items-start justify-between gap-4 mb-4">
          <div className="flex items-baseline gap-3">
            <span
              className="text-xl font-black text-zinc-100 tracking-tight leading-none"
              style={{ fontFamily: "'JetBrains Mono', monospace" }}
            >
              {item.ticker}
            </span>
            <span className="text-xs text-zinc-500 font-mono">{item.status}</span>
          </div>

          <span
            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-mono font-medium tracking-wide border"
            style={{
              color,
              background: `${color}18`,
              borderColor: `${color}40`,
            }}
          >
            <span
              className="h-1.5 w-1.5 rounded-full"
              style={{ background: color }}
            />
            {PHASE_LABEL[item.phase]}
          </span>
        </div>

        {/* Stats grid */}
        <div className="grid grid-cols-2 gap-x-8 gap-y-3 sm:grid-cols-4">
          <Stat label="Strike" value={item.strike ? formatCurrency(item.strike) : '—'} />
          <Stat label="Expiration" value={item.expiration ?? '—'} />
          <Stat
            label="DTE"
            value={item.dte !== null ? `${item.dte}d` : 'Expired'}
            accentColor={dteUrgent ? '#f59e0b' : undefined}
          />
          <Stat label="Premium Collected" value={formatCurrency(item.premium_collected)} accentColor="#34d399" />
          <Stat label="Cost Basis" value={formatCurrency(item.effective_cost_basis)} />
        </div>
      </div>
    </article>
  );
}

type StatProps = {
  label: string;
  value: string;
  accentColor?: string;
};

function Stat({ label, value, accentColor }: StatProps): JSX.Element {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[10px] font-mono tracking-widest uppercase text-zinc-500">
        {label}
      </span>
      <span
        className="text-sm font-medium"
        style={{
          fontFamily: "'JetBrains Mono', monospace",
          color: accentColor ?? 'rgb(228 228 231)', // zinc-200
        }}
      >
        {value}
      </span>
    </div>
  );
}
