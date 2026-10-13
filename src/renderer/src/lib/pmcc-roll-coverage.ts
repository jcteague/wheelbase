// [US-104][US-105] The Roll Short Call and Roll LEAPS sheets' coverage rulers: marks, fill, blocked state and
// note, from the open contracts and the replacement being entered. Pure, no React.
import { differenceInCalendarDays, isBefore, parseISO } from 'date-fns'
import { shortExpiresBeforeLeaps } from '../../../main/core/pmcc-rules'
import { ISO_DATE_REGEX } from '../schemas/common'
import { computeDteFromInput } from './format'

export type PmccRulerTone = 'muted' | 'secondary' | 'green' | 'accent'

export type PmccRulerMark = {
  key: string
  /** `null` lists the mark in the legend without a tick (`Open short call · none`). */
  date: string | null
  label: string
  value: string
  tone: PmccRulerTone
}

/** Days from `today` to `date`; `0` while `date` is not a complete `YYYY-MM-DD`. */
const dteFrom = (today: string, date: string): number =>
  computeDteFromInput(date, parseISO(today)) ?? 0

export type ShortRollCoverageInput = {
  today: string
  currentExpiration: string
  /** Free text from the form; ignored until it is a complete `YYYY-MM-DD`. */
  replacementExpiration: string
  leapsExpiration: string
}

/** A roll sheet's ruler: the props `PmccCoverageRuler` takes besides `today`. */
export type PmccRollCoverage = {
  blocked: boolean
  fillTo: string
  marks: readonly PmccRulerMark[]
  note: string
}

/**
 * The short roll's ruler: the replacement must land at or after the current short (else a
 * buyback) and strictly before the LEAPS (else naked).
 */
export function shortRollCoverage({
  today,
  currentExpiration,
  replacementExpiration,
  leapsExpiration
}: ShortRollCoverageInput): PmccRollCoverage {
  const dte = (date: string): number => dteFrom(today, date)
  const currentDte = dte(currentExpiration)
  const leapsDte = dte(leapsExpiration)
  const entered = ISO_DATE_REGEX.test(replacementExpiration)
  const replacementDte = dte(replacementExpiration)
  const naked = entered && !shortExpiresBeforeLeaps(replacementExpiration, leapsExpiration)
  const buyback = entered && isBefore(parseISO(replacementExpiration), parseISO(currentExpiration))
  const marks: PmccRulerMark[] = [
    { key: 'today', date: today, label: 'Today', value: today, tone: 'muted' },
    {
      key: 'current',
      date: currentExpiration,
      label: 'Current short call',
      value: `${currentExpiration} · ${currentDte} DTE`,
      tone: 'secondary'
    },
    {
      key: 'replacement',
      date: entered ? replacementExpiration : null,
      label: 'Replacement short call',
      value: entered ? `${replacementExpiration} · ${replacementDte} DTE` : 'not entered',
      tone: 'accent'
    },
    {
      key: 'leaps',
      date: leapsExpiration,
      label: 'LEAPS (covers)',
      value: `${leapsExpiration} · ${leapsDte} DTE`,
      tone: 'green'
    }
  ]
  return {
    blocked: naked || buyback,
    fillTo: entered ? replacementExpiration : currentExpiration,
    marks,
    note: coverageNote({ entered, naked, buyback, currentDte, replacementDte, leapsDte })
  }
}

type CoverageNoteInput = {
  entered: boolean
  naked: boolean
  buyback: boolean
  currentDte: number
  replacementDte: number
  leapsDte: number
}

function coverageNote({
  entered,
  naked,
  buyback,
  currentDte,
  replacementDte,
  leapsDte
}: CoverageNoteInput): string {
  if (!entered) {
    return `Current short call expires in ${currentDte} days. The LEAPS covers ${leapsDte} days.`
  }
  if (naked) {
    return 'The replacement short reaches the LEAPS. Past this point the short call is naked.'
  }
  if (buyback) {
    return 'The replacement expires before the current short call — that is a buyback, not a roll.'
  }
  return `Replacement short at ${replacementDte} DTE. The LEAPS still covers it by ${leapsDte - replacementDte} days.`
}

export type LeapsRollCoverageInput = {
  today: string
  /** The open short's expiration; `null` when no short is open. */
  openShortExpiration: string | null
  currentExpiration: string
  /** Free text from the form; ignored until it is a complete `YYYY-MM-DD`. */
  replacementExpiration: string
}

/** Inside this many days a LEAPS' time value starts to decay fast. */
const LEAPS_DECAY_WINDOW_DAYS = 90

/**
 * The LEAPS roll's ruler, US-104's inverted: the replacement may land before the current LEAPS
 * (coverage shortens — advisory) but never on or before the open short (naked — blocked).
 */
export function leapsRollCoverage({
  today,
  openShortExpiration,
  currentExpiration,
  replacementExpiration
}: LeapsRollCoverageInput): PmccRollCoverage {
  const dte = (date: string): number => dteFrom(today, date)
  const currentDte = dte(currentExpiration)
  const entered = ISO_DATE_REGEX.test(replacementExpiration)
  const replacementDte = dte(replacementExpiration)
  const blocked =
    entered &&
    openShortExpiration !== null &&
    !shortExpiresBeforeLeaps(openShortExpiration, replacementExpiration)
  const marks: PmccRulerMark[] = [
    { key: 'today', date: today, label: 'Today', value: today, tone: 'muted' },
    {
      key: 'short',
      date: openShortExpiration,
      label: 'Open short call',
      value:
        openShortExpiration === null
          ? 'none'
          : `${openShortExpiration} · ${dte(openShortExpiration)} DTE`,
      tone: 'secondary'
    },
    {
      key: 'current',
      date: currentExpiration,
      label: 'Current LEAPS (selling)',
      value: `${currentExpiration} · ${currentDte} DTE`,
      tone: 'green'
    },
    {
      key: 'replacement',
      date: entered ? replacementExpiration : null,
      label: 'Replacement LEAPS (buying)',
      value: entered ? `${replacementExpiration} · ${replacementDte} DTE` : 'not entered',
      tone: 'accent'
    }
  ]
  return {
    blocked,
    fillTo: entered ? replacementExpiration : currentExpiration,
    marks,
    note: leapsCoverageNote({
      entered,
      blocked,
      currentDte,
      replacementDte,
      openShortExpiration,
      replacementExpiration
    })
  }
}

type LeapsCoverageNoteInput = {
  entered: boolean
  blocked: boolean
  currentDte: number
  replacementDte: number
  openShortExpiration: string | null
  replacementExpiration: string
}

function leapsCoverageNote({
  entered,
  blocked,
  currentDte,
  replacementDte,
  openShortExpiration,
  replacementExpiration
}: LeapsCoverageNoteInput): string {
  if (!entered) {
    const window =
      currentDte <= LEAPS_DECAY_WINDOW_DAYS
        ? ' — inside the window where its time value starts to decay fast'
        : ''
    const cover =
      openShortExpiration === null
        ? ''
        : ` The open short call needs cover past ${openShortExpiration}.`
    return `Current LEAPS expires in ${currentDte} days${window}.${cover}`
  }
  if (blocked) {
    return 'The replacement LEAPS expires on or before the short call. Past this point the short call is naked.'
  }
  const margin =
    openShortExpiration === null
      ? ''
      : `, ${differenceInCalendarDays(parseISO(replacementExpiration), parseISO(openShortExpiration))} days past the short call`
  return `Replacement LEAPS at ${replacementDte} DTE${margin}.`
}
