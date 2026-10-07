// [US-104] Today, the current short call, the replacement and the LEAPS on one axis: the
// replacement must land at or after the current short and strictly before the LEAPS.
import { isBefore, parseISO } from 'date-fns'
import { shortExpiresBeforeLeaps } from '../../../main/core/pmcc-rules'
import { computeDteFromInput } from '../lib/format'
import { ISO_DATE_REGEX } from '../schemas/common'

type PmccCoverageRulerProps = {
  today: string
  currentExpiration: string
  /** Free text from the form; ignored until it is a complete `YYYY-MM-DD`. */
  replacementExpiration: string
  leapsExpiration: string
}

type Mark = {
  key: 'today' | 'current' | 'replacement' | 'leaps'
  label: string
  value: string
  dte: number
  tick: string
}

/** The replacement short once its expiration parses: `naked` past the LEAPS, `buyback` before the current short. */
type Replacement = { dte: number; naked: boolean; buyback: boolean }

function coverageNote(
  replacement: Replacement | null,
  currentDte: number,
  leapsDte: number
): string {
  if (replacement === null) {
    return `Current short call expires in ${currentDte} days. The LEAPS covers ${leapsDte} days.`
  }
  if (replacement.naked) {
    return 'The replacement short reaches the LEAPS. Past this point the short call is naked.'
  }
  if (replacement.buyback) {
    return 'The replacement expires before the current short call — that is a buyback, not a roll.'
  }
  return `Replacement short at ${replacement.dte} DTE. The LEAPS still covers it by ${leapsDte - replacement.dte} days.`
}

export function PmccCoverageRuler({
  today,
  currentExpiration,
  replacementExpiration,
  leapsExpiration
}: PmccCoverageRulerProps): React.JSX.Element {
  const dte = (date: string): number => computeDteFromInput(date, parseISO(today)) ?? 0
  const currentDte = dte(currentExpiration)
  const leapsDte = dte(leapsExpiration)
  const replacement: Replacement | null = ISO_DATE_REGEX.test(replacementExpiration)
    ? {
        dte: dte(replacementExpiration),
        naked: !shortExpiresBeforeLeaps(replacementExpiration, leapsExpiration),
        buyback: isBefore(parseISO(replacementExpiration), parseISO(currentExpiration))
      }
    : null
  const blocked = replacement !== null && (replacement.naked || replacement.buyback)
  const tone = blocked ? 'bg-wb-red' : 'bg-wb-gold'
  const at = (days: number): string =>
    `${Math.min(100, Math.max(0, (days / Math.max(leapsDte, 1)) * 100)).toFixed(2)}%`

  const marks: Mark[] = [
    {
      key: 'today',
      label: 'Today',
      value: today,
      dte: 0,
      tick: 'top-1.5 h-3 w-px bg-wb-text-muted'
    },
    {
      key: 'current',
      label: 'Current short call',
      value: `${currentExpiration} · ${currentDte} DTE`,
      dte: currentDte,
      tick: 'top-1.5 h-3 w-px bg-wb-text-secondary'
    },
    ...(replacement
      ? [
          {
            key: 'replacement' as const,
            label: 'Replacement short call',
            value: `${replacementExpiration} · ${replacement.dte} DTE`,
            dte: replacement.dte,
            tick: `top-0 h-6 w-0.5 ${tone}`
          }
        ]
      : []),
    {
      key: 'leaps',
      label: 'LEAPS (covers)',
      value: `${leapsExpiration} · ${leapsDte} DTE`,
      dte: leapsDte,
      tick: 'top-1.5 h-3 w-px bg-wb-green'
    }
  ]

  return (
    <div
      data-testid="pmcc-coverage-ruler"
      data-blocked={String(blocked)}
      className="flex flex-col gap-3 px-4 py-4"
    >
      <div className="relative h-8">
        <div className="absolute inset-x-0 top-3 h-px bg-wb-border" />
        <div
          className={`absolute left-0 top-3 h-px ${tone}`}
          style={{ width: at(replacement?.dte ?? currentDte) }}
        />
        {marks.map((mark) => (
          <div
            key={mark.key}
            data-mark={mark.key}
            className={`absolute ${mark.tick}`}
            style={{ left: at(mark.dte) }}
          />
        ))}
      </div>
      <div className="flex flex-col gap-1 text-[10px] text-wb-text-muted">
        {marks.map((mark) => (
          <div key={mark.key} className="flex items-center gap-2">
            <span className="text-wb-text-secondary">{mark.label}</span>
            <span
              className={`ml-auto ${mark.key === 'replacement' && blocked ? 'text-wb-red' : ''}`}
            >
              {mark.value}
            </span>
          </div>
        ))}
        {replacement === null && (
          <div className="flex items-center gap-2">
            <span className="text-wb-text-secondary">Replacement short call</span>
            <span className="ml-auto">not entered</span>
          </div>
        )}
      </div>
      <p
        className={`text-[11px] leading-relaxed ${blocked ? 'text-wb-red' : 'text-wb-text-secondary'}`}
      >
        {coverageNote(replacement, currentDte, leapsDte)}
      </p>
    </div>
  )
}
