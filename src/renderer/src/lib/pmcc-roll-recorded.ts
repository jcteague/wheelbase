// [US-104] [US-105] A recorded PMCC roll, as the position detail page holds it for the
// confirmation banner.
import type { RollPmccLeapsResponse, RollPmccShortCallResponse } from '../api/positions'

/** A recorded PMCC roll: which leg was rolled and the server's response for it. */
export type PmccRecordedRoll =
  | { kind: 'short'; result: RollPmccShortCallResponse }
  | { kind: 'leaps'; result: RollPmccLeapsResponse }
