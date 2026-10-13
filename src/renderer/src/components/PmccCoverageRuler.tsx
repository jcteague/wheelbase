// [US-104][US-105] One axis from today to the furthest dated mark: a fill bar to `fillTo`, a tick
// per dated mark, a legend row per mark and the caller's note. Each roll form supplies its own
// marks and note; the `accent` mark is the proposed contract and takes the ruler's gold / red.
import { parseISO } from 'date-fns'
import { computeDteFromInput } from '../lib/format'
import type { PmccRollCoverage, PmccRulerMark, PmccRulerTone } from '../lib/pmcc-roll-coverage'

type PmccCoverageRulerProps = PmccRollCoverage & { today: string }

const PLAIN_TONE: Record<Exclude<PmccRulerTone, 'accent'>, string> = {
  muted: 'bg-wb-text-muted',
  secondary: 'bg-wb-text-secondary',
  green: 'bg-wb-green'
}

type LegendItemProps = {
  swatch: string
  label: string
  value: string
  valueTone: string
}

function LegendItem({ swatch, label, value, valueTone }: LegendItemProps): React.JSX.Element {
  return (
    <div className="flex items-center gap-2">
      <span className="flex w-2 shrink-0 justify-center">
        <span className={swatch} />
      </span>
      <span className="text-wb-text-secondary">{label}</span>
      <span className={`ml-auto ${valueTone}`}>{value}</span>
    </div>
  )
}

export function PmccCoverageRuler({
  today,
  blocked,
  fillTo,
  marks,
  note
}: PmccCoverageRulerProps): React.JSX.Element {
  const dte = (date: string): number => computeDteFromInput(date, parseISO(today)) ?? 0
  const dated = marks.flatMap((mark) =>
    mark.date === null ? [] : [{ ...mark, dte: dte(mark.date) }]
  )
  const span = Math.max(1, ...dated.map((mark) => mark.dte))
  const at = (days: number): string =>
    `${Math.min(100, Math.max(0, (days / span) * 100)).toFixed(2)}%`
  const accent = blocked ? 'bg-wb-red' : 'bg-wb-gold'
  const isAccent = (mark: PmccRulerMark): boolean => mark.tone === 'accent'
  const color = (mark: PmccRulerMark): string =>
    mark.tone === 'accent' ? accent : PLAIN_TONE[mark.tone]
  // An undated plain mark keeps its legend row but has nothing on the axis to match a swatch to.
  const swatchColor = (mark: PmccRulerMark): string =>
    mark.date === null && !isAccent(mark) ? 'bg-transparent' : color(mark)

  return (
    <div
      data-testid="pmcc-coverage-ruler"
      data-blocked={String(blocked)}
      className="flex flex-col gap-3 px-4 py-4"
    >
      <div className="relative h-8">
        <div className="absolute inset-x-0 top-3 h-px bg-wb-border" />
        <div
          data-testid="pmcc-coverage-fill"
          className={`absolute left-0 top-3 h-px ${accent}`}
          style={{ width: at(dte(fillTo)) }}
        />
        {dated.map((mark) => (
          <div
            key={mark.key}
            data-mark={mark.key}
            className={`absolute ${isAccent(mark) ? 'top-0 h-6 w-0.5' : 'top-1.5 h-3 w-px'} ${color(mark)}`}
            style={{ left: at(mark.dte) }}
          />
        ))}
      </div>
      <div className="flex flex-col gap-1 text-[10px] text-wb-text-muted">
        {marks.map((mark) => (
          <LegendItem
            key={mark.key}
            swatch={`${isAccent(mark) ? 'h-4 w-0.5' : 'h-3 w-px'} ${swatchColor(mark)}`}
            label={mark.label}
            value={mark.value}
            valueTone={isAccent(mark) && blocked ? 'text-wb-red' : ''}
          />
        ))}
      </div>
      <p
        className={`text-[11px] leading-relaxed ${blocked ? 'text-wb-red' : 'text-wb-text-secondary'}`}
      >
        {note}
      </p>
    </div>
  )
}
