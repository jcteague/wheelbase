import type { WheelPhase } from '../api/positions'
import { PHASE_COLOR } from '../lib/phase'

/** Cell and value classes shared by the wheel `PositionRow` and `PmccPositionRow`. */
export const CELL_CLASS = 'py-[10px] px-[16px] border-b-0'
export const VALUE_CLASS = 'font-wb-mono text-[0.8125rem]'

/** Zebra background + phase accent as CSS variables read by the `wb-position-row` class. */
export function rowStyle(index: number, phase: WheelPhase): React.CSSProperties {
  return {
    '--wb-row-bg': index % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.01)',
    '--wb-row-phase-color': PHASE_COLOR[phase]
  } as React.CSSProperties
}
