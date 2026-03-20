import { useCallback, useState } from 'react'
import { useParams } from 'wouter'
import { AssignmentSheet } from '../components/AssignmentSheet'
import { CloseCspForm } from '../components/CloseCspForm'
import { ExpirationSheet } from '../components/ExpirationSheet'
import { OpenCoveredCallSheet } from '../components/OpenCoveredCallSheet'
import { LegHistoryTable } from '../components/LegHistoryTable'
import { PageHeader, PageLayout } from '../components/PageLayout'
import { PositionDetailActions } from '../components/PositionDetailActions'
import { Breadcrumb } from '../components/ui/Breadcrumb'
import { Caption } from '../components/ui/Caption'
import { ErrorAlert } from '../components/ui/ErrorAlert'
import { LoadingState } from '../components/ui/LoadingState'
import { SectionCard } from '../components/ui/SectionCard'
import { StatGrid } from '../components/ui/Stat'
import { usePosition } from '../hooks/usePosition'
import { computeDte, fmtMoney, pnlColor } from '../lib/format'
import { MONO } from '../lib/tokens'

export function PositionDetailPage(): React.JSX.Element {
  const { id } = useParams<{ id: string }>()
  const { isLoading, isError, data } = usePosition(id)
  const [expirationCtx, setExpirationCtx] = useState<{
    activeLeg: NonNullable<typeof data>['activeLeg']
    snapshot: NonNullable<typeof data>['costBasisSnapshot']
  } | null>(null)
  const [assignmentCtx, setAssignmentCtx] = useState<{
    activeLeg: NonNullable<typeof data>['activeLeg']
    snapshot: NonNullable<typeof data>['costBasisSnapshot']
  } | null>(null)
  const [openCcCtx, setOpenCcCtx] = useState<{
    basisPerShare: string
    totalPremiumCollected: string
    contracts: number
    assignmentDate: string
  } | null>(null)

  const handleOpenCc = useCallback(() => {
    const assignLeg = data?.legs?.find((l) => l.legRole === 'ASSIGN')
    const snapshot = data?.costBasisSnapshot
    if (assignLeg && snapshot) {
      setOpenCcCtx({
        basisPerShare: snapshot.basisPerShare,
        totalPremiumCollected: snapshot.totalPremiumCollected,
        contracts: assignLeg.contracts,
        assignmentDate: assignLeg.fillDate
      })
    }
  }, [data])

  const handleRecordAssignment = useCallback(() => {
    if (data?.activeLeg && data?.costBasisSnapshot)
      setAssignmentCtx({ activeLeg: data.activeLeg, snapshot: data.costBasisSnapshot })
  }, [data])

  const handleRecordExpiration = useCallback(() => {
    if (data?.activeLeg && data?.costBasisSnapshot)
      setExpirationCtx({ activeLeg: data.activeLeg, snapshot: data.costBasisSnapshot })
  }, [data])

  const handleCloseExpiration = useCallback(() => setExpirationCtx(null), [])
  const handleCloseAssignment = useCallback(() => setAssignmentCtx(null), [])
  const handleCloseOpenCc = useCallback(() => setOpenCcCtx(null), [])

  if (isLoading) {
    return <LoadingState message="Loading position..." />
  }

  if (isError || !data) {
    return (
      <div style={{ margin: '16px 24px' }}>
        <ErrorAlert message="Failed to load position." />
      </div>
    )
  }

  const { position, activeLeg, costBasisSnapshot, legs } = data
  const dte = activeLeg ? computeDte(activeLeg.expiration) : null
  const dteUrgent = dte !== null && dte <= 7

  const premiumWaterfall =
    legs
      .filter((leg) => leg.legRole === 'CSP_OPEN' || leg.legRole === 'ROLL_TO')
      .map((leg) => ({
        label: leg.legRole === 'ROLL_TO' ? 'Roll credit' : 'CSP premium',
        amount: leg.premiumPerContract
      })) || []
  const assignmentWaterfall =
    premiumWaterfall.length > 0 && activeLeg
      ? premiumWaterfall
      : activeLeg
        ? [{ label: 'CSP premium', amount: activeLeg.premiumPerContract }]
        : []

  return (
    <PageLayout
      header={
        <PageHeader
          left={<Breadcrumb backTo="#/" backLabel="Positions" current={position.ticker} />}
          right={
            <PositionDetailActions
              phase={position.phase}
              hasCostBasis={Boolean(costBasisSnapshot)}
              onOpenCc={handleOpenCc}
              onRecordAssignment={handleRecordAssignment}
              onRecordExpiration={handleRecordExpiration}
            />
          }
        />
      }
    >
      <main
        data-testid="position-detail"
        style={{
          padding: '24px',
          display: 'flex',
          flexDirection: 'column',
          gap: 16,
          transition: 'filter 0.2s, opacity 0.2s',
          ...(expirationCtx || assignmentCtx || openCcCtx
            ? { filter: 'blur(1.5px)', opacity: 0.35, pointerEvents: 'none', userSelect: 'none' }
            : {})
        }}
      >
        {activeLeg && (
          <SectionCard header="Open Leg">
            <StatGrid
              minWidth={110}
              items={[
                {
                  label: 'Strike',
                  value: (
                    <span style={{ color: 'var(--wb-gold)' }}>{fmtMoney(activeLeg.strike)}</span>
                  )
                },
                { label: 'Expiration', value: activeLeg.expiration },
                {
                  label: 'DTE',
                  value: (
                    <span style={{ color: dteUrgent ? 'var(--wb-gold)' : 'inherit' }}>
                      {dte !== null ? `${dte}d` : '—'}
                    </span>
                  )
                },
                { label: 'Contracts', value: activeLeg.contracts },
                {
                  label: 'Premium / Contract',
                  value: (
                    <span style={{ color: 'var(--wb-green)' }}>
                      {fmtMoney(activeLeg.premiumPerContract)}
                    </span>
                  )
                },
                { label: 'Fill Date', value: activeLeg.fillDate }
              ]}
            />
          </SectionCard>
        )}

        {costBasisSnapshot && (
          <SectionCard header="Cost Basis">
            <StatGrid
              minWidth={140}
              items={[
                {
                  label: 'Effective Basis / Share',
                  value: (
                    <span style={{ color: 'var(--wb-sky)' }}>
                      {fmtMoney(costBasisSnapshot.basisPerShare)}
                    </span>
                  )
                },
                {
                  label: 'Premium Collected',
                  value: (
                    <span style={{ color: 'var(--wb-green)' }}>
                      {fmtMoney(costBasisSnapshot.totalPremiumCollected)}
                    </span>
                  )
                },
                ...(costBasisSnapshot.finalPnl
                  ? [
                      {
                        label: 'Final P&L',
                        value: (
                          <span style={{ color: pnlColor(costBasisSnapshot.finalPnl) }}>
                            {fmtMoney(costBasisSnapshot.finalPnl)}
                          </span>
                        )
                      }
                    ]
                  : [])
              ]}
            />
          </SectionCard>
        )}

        {legs && legs.length > 0 && (
          <SectionCard header="Leg History">
            <LegHistoryTable legs={legs} />
          </SectionCard>
        )}

        {(position.thesis || position.notes) && (
          <SectionCard header="Notes">
            <div
              style={{ padding: '14px 20px', display: 'flex', flexDirection: 'column', gap: 10 }}
            >
              {position.thesis && (
                <div>
                  <div style={{ marginBottom: 4 }}>
                    <Caption>Thesis</Caption>
                  </div>
                  <div
                    style={{
                      fontFamily: MONO,
                      fontSize: '0.875rem',
                      color: 'var(--wb-text-primary)'
                    }}
                  >
                    {position.thesis}
                  </div>
                </div>
              )}
              {position.notes && (
                <div>
                  <div style={{ marginBottom: 4 }}>
                    <Caption>Notes</Caption>
                  </div>
                  <div
                    style={{
                      fontFamily: MONO,
                      fontSize: '0.875rem',
                      color: 'var(--wb-text-primary)'
                    }}
                  >
                    {position.notes}
                  </div>
                </div>
              )}
            </div>
          </SectionCard>
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

        {position.phase !== 'CSP_OPEN' && position.closedDate && (
          <div
            style={{
              padding: '10px 16px',
              borderRadius: 6,
              background: 'var(--wb-green-dim)',
              border: '1px solid rgba(63,185,80,0.2)',
              color: 'var(--wb-text-secondary)',
              fontSize: '0.8125rem',
              fontFamily: MONO
            }}
          >
            Closed on {position.closedDate}
          </div>
        )}
      </main>
      {expirationCtx?.activeLeg && expirationCtx.snapshot && (
        <ExpirationSheet
          open
          positionId={position.id}
          ticker={position.ticker}
          strike={expirationCtx.activeLeg.strike}
          expiration={expirationCtx.activeLeg.expiration}
          contracts={expirationCtx.activeLeg.contracts}
          totalPremiumCollected={expirationCtx.snapshot.totalPremiumCollected}
          onClose={handleCloseExpiration}
        />
      )}
      {assignmentCtx?.activeLeg && assignmentCtx.snapshot && (
        <AssignmentSheet
          open
          positionId={position.id}
          ticker={position.ticker}
          strike={assignmentCtx.activeLeg.strike}
          expiration={assignmentCtx.activeLeg.expiration}
          contracts={assignmentCtx.activeLeg.contracts}
          openFillDate={assignmentCtx.activeLeg.fillDate}
          premiumWaterfall={assignmentWaterfall}
          projectedBasisPerShare={assignmentCtx.snapshot.basisPerShare}
          onClose={handleCloseAssignment}
        />
      )}
      {openCcCtx && (
        <OpenCoveredCallSheet
          open
          positionId={position.id}
          ticker={position.ticker}
          basisPerShare={openCcCtx.basisPerShare}
          totalPremiumCollected={openCcCtx.totalPremiumCollected}
          contracts={openCcCtx.contracts}
          assignmentDate={openCcCtx.assignmentDate}
          onClose={handleCloseOpenCc}
        />
      )}
    </PageLayout>
  )
}
