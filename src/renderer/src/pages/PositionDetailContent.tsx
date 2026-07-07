import type { OptionSnapshot } from '../api/market-data'
import type { PositionDetail } from '../api/positions'
import { CloseCspForm } from '../components/CloseCspForm'
import { PositionAlertOverridesForm } from '../components/PositionAlertOverridesForm'
import { Caption } from '../components/ui/Caption'
import { SectionCard } from '../components/ui/SectionCard'
import { PositionCockpit } from '../components/position-cockpit/PositionCockpit'

const DETAIL_OVERLAY_STYLE: React.CSSProperties = {
  filter: 'blur(1.5px)',
  opacity: 0.35,
  pointerEvents: 'none',
  userSelect: 'none'
}

type PositionDetailContentProps = {
  detail: PositionDetail
  overlayOpen: boolean
  snapshot?: OptionSnapshot
  underlyingPrice?: string | null
  pnlStale?: boolean
}

function NoteBlock({ label, text }: { label: string; text: string }): React.JSX.Element {
  return (
    <div>
      <div className="mb-1">
        <Caption>{label}</Caption>
      </div>
      <div className="font-wb-mono text-sm text-wb-text-primary">{text}</div>
    </div>
  )
}

export function PositionDetailContent({
  detail,
  overlayOpen,
  snapshot,
  underlyingPrice,
  pnlStale
}: PositionDetailContentProps): React.JSX.Element {
  const { position, activeLeg } = detail

  return (
    <main
      data-testid="position-detail"
      className="flex-1 overflow-y-auto flex flex-col gap-4 p-6"
      style={overlayOpen ? DETAIL_OVERLAY_STYLE : undefined}
    >
      <PositionCockpit
        detail={detail}
        snapshot={snapshot}
        underlyingPrice={underlyingPrice}
        pnlStale={pnlStale}
      />

      <PositionAlertOverridesForm
        positionId={position.id}
        profitTargetPercent={position.profitTargetPercent}
        managementWindowDteOverride={position.managementWindowDteOverride}
      />

      {(position.thesis || position.notes) && (
        <SectionCard header="Notes">
          <div className="py-3.5 px-5 flex flex-col gap-2.5">
            {position.thesis && <NoteBlock label="Thesis" text={position.thesis} />}
            {position.notes && <NoteBlock label="Notes" text={position.notes} />}
          </div>
        </SectionCard>
      )}

      {position.phase !== 'CSP_OPEN' && position.closedDate && (
        <div className="py-2.5 px-4 rounded-md bg-wb-green-dim border border-wb-green-border text-wb-text-secondary text-sm font-wb-mono">
          Closed on {position.closedDate}
        </div>
      )}

      {position.phase === 'CSP_OPEN' && activeLeg && (
        <CloseCspForm
          positionId={position.id}
          openPremiumPerContract={activeLeg.premiumPerContract}
          contracts={activeLeg.contracts}
          openFillDate={activeLeg.fillDate}
          expiration={activeLeg.expiration}
        />
      )}
    </main>
  )
}
