// [US-18] Card actions as the wheel card receives them, one per lane the MSFT covered call can
// raise in the story's Background: the 10-DTE management window, the 4-DTE expiry and the
// call-strike breach.
import type { CardAction } from '../lib/card-actions'

export const MANAGEMENT_WINDOW: CardAction = {
  glyph: '◷',
  statusWord: 'MANAGEMENT WINDOW',
  tone: 'gold',
  rank: 5,
  summary: '10 DTE remaining — review for roll or close'
}

export const EXPIRING: CardAction = {
  glyph: '◷',
  statusWord: 'EXPIRING',
  tone: 'gold',
  rank: 4,
  summary: 'Expires in 4 days at $430.00 strike'
}

export const CALL_BREACHED: CardAction = {
  glyph: '▲',
  statusWord: 'CALL BREACHED',
  tone: 'red',
  rank: 1,
  summary: 'Stock is 1.2% above the $430.00 call strike — shares may be called away'
}
