import { useParams } from 'wouter'
import { AssignmentSheet } from '../components/AssignmentSheet'
import { CallAwaySheet } from '../components/CallAwaySheet'
import { CcExpirationSheet } from '../components/CcExpirationSheet'
import { CloseCcEarlySheet } from '../components/CloseCcEarlySheet'
import { ExpirationSheet } from '../components/ExpirationSheet'
import { OpenCoveredCallSheet } from '../components/OpenCoveredCallSheet'
import { PageHeader, PageLayout } from '../components/PageLayout'
import { PositionDetailActions } from '../components/PositionDetailActions'
import { Breadcrumb } from '../components/ui/Breadcrumb'
import { ErrorAlert } from '../components/ui/ErrorAlert'
import { LoadingState } from '../components/ui/LoadingState'
import { usePosition } from '../hooks/usePosition'
import { computeDte, fmtDate } from '../lib/format'
import { PositionDetailContent } from './PositionDetailContent'
import { usePositionDetailSheets } from './usePositionDetailSheets'

export function PositionDetailPage(): React.JSX.Element {
  const { id } = useParams<{ id: string }>()
  const { isLoading, isError, data } = usePosition(id)

  const {
    assignmentWaterfall,
    overlayOpen,
    expirationCtx,
    assignmentCtx,
    openCcCtx,
    closeCcCtx,
    callAwayCtx,
    ccExpirationCtx,
    handleOpenCc,
    handleRecordAssignment,
    handleRecordExpiration,
    handleCloseCcEarly,
    handleRecordCallAway,
    handleRecordCcExpiration,
    handleCloseExpiration,
    handleCloseAssignment,
    handleCloseOpenCc,
    handleCloseCloseCcEarly,
    handleCloseCallAway,
    handleCloseCcExpiration,
    handleOpenCoveredCallFromAssignment
  } = usePositionDetailSheets(data)

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
  const ccExpired =
    position.phase === 'CC_OPEN' && activeLeg ? computeDte(activeLeg.expiration) <= 0 : false
  const assignLeg = legs.find((leg) => leg.legRole === 'ASSIGN')

  return (
    <PageLayout
      header={
        <PageHeader
          left={<Breadcrumb backTo="#/" backLabel="Positions" current={position.ticker} />}
          right={
            <PositionDetailActions
              phase={position.phase}
              hasCostBasis={Boolean(costBasisSnapshot)}
              ccExpired={ccExpired}
              onOpenCc={handleOpenCc}
              onRecordAssignment={handleRecordAssignment}
              onRecordExpiration={handleRecordExpiration}
              onCloseCcEarly={handleCloseCcEarly}
              onRecordCallAway={handleRecordCallAway}
              onRecordCcExpiration={handleRecordCcExpiration}
            />
          }
        />
      }
    >
      <PositionDetailContent detail={data} overlayOpen={overlayOpen} />
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
          onOpenCoveredCall={handleOpenCoveredCallFromAssignment}
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
      {closeCcCtx && (
        <CloseCcEarlySheet
          open
          positionId={position.id}
          ticker={position.ticker}
          contracts={closeCcCtx.contracts}
          openPremium={closeCcCtx.openPremium}
          ccOpenFillDate={closeCcCtx.ccOpenFillDate}
          ccExpiration={closeCcCtx.ccExpiration}
          strike={closeCcCtx.strike}
          basisPerShare={closeCcCtx.basisPerShare}
          onClose={handleCloseCloseCcEarly}
        />
      )}
      {callAwayCtx && (
        <CallAwaySheet
          open
          positionId={position.id}
          ticker={position.ticker}
          ccStrike={callAwayCtx.ccStrike}
          ccExpiration={callAwayCtx.ccExpiration}
          contracts={callAwayCtx.contracts}
          basisPerShare={callAwayCtx.basisPerShare}
          positionOpenedDate={callAwayCtx.positionOpenedDate}
          onClose={handleCloseCallAway}
        />
      )}
      {ccExpirationCtx?.activeLeg && (
        <CcExpirationSheet
          open
          positionId={position.id}
          ticker={position.ticker}
          strike={ccExpirationCtx.activeLeg.strike}
          expiration={ccExpirationCtx.activeLeg.expiration}
          expirationDisplay={fmtDate(ccExpirationCtx.activeLeg.expiration)}
          contracts={ccExpirationCtx.activeLeg.contracts}
          premiumPerContract={ccExpirationCtx.activeLeg.premiumPerContract}
          sharesHeld={assignLeg?.contracts ? assignLeg.contracts * 100 : 0}
          onClose={handleCloseCcExpiration}
        />
      )}
    </PageLayout>
  )
}
