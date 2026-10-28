import type { StrategyPhase } from '../../../../main/core/types'

export type { CardAction, CardTone } from '../../lib/card-actions'

/** A wheel card is accented by its phase; every PMCC card shares the one `PMCC` accent. */
export type CardAccent = StrategyPhase<'WHEEL'> | 'PMCC'
