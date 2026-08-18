// [US-70] The renderer stamps an earnings date with `fmtDate` (`MMM d`, via
// `toLocaleDateString`). Mirroring that here — rather than hardcoding 'Jul 31' — keeps
// the badge expectations true in any machine's locale, the same technique the US-66
// spec uses for its IVR observation label.
export function fmtBadgeDate(isoDate: string): string {
  const [year, month, day] = isoDate.split('-').map(Number)
  return new Date(year, month - 1, day).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric'
  })
}
