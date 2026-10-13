import { useMemo } from 'react'
import { useParams } from 'wouter'
import { AssignmentSheet } from '../components/AssignmentSheet'
import { CallAwaySheet } from '../components/CallAwaySheet'
import { CcExpirationSheet } from '../components/CcExpirationSheet'
import { CloseCcEarlySheet } from '../components/CloseCcEarlySheet'
import { ExpirationSheet } from '../components/ExpirationSheet'
import { OpenCoveredCallSheet } from '../components/OpenCoveredCallSheet'
import { RollCcSheet } from '../components/RollCcSheet'
import { RollCspSheet } from '../components/RollCspSheet'
import { PmccRollRecordedBanner } from '../components/PmccRollRecordedBanner'
import { RollPmccLeapsSheet } from '../components/RollPmccLeapsSheet'
import { RollPmccShortCallSheet } from '../components/RollPmccShortCallSheet'
import { PageHeader, PageLayout } from '../components/PageLayout'
import { PositionDetailActions } from '../components/PositionDetailActions'
import { Breadcrumb } from '../components/ui/Breadcrumb'
import { ErrorAlert } from '../components/ui/ErrorAlert'
import { LoadingState } from '../components/ui/LoadingState'
import { usePosition } from '../hooks/usePosition'
import { useOptionSnapshots, type ActiveLegSummary } from '../hooks/useOptionSnapshots'
import { useStockQuotes } from '../hooks/useStockQuotes'
import { buildOccSymbol } from '../../../shared/option-symbol'
import { latestFillDate } from '../../../main/core/pmcc-rules'
import { isOptionInstrument } from '../../../main/core/types'
import { computeDte, fmtDate } from '../lib/format'
import { pmccLeapsLedger } from '../lib/pmcc-roll'
import { PositionDetailContent } from './PositionDetailContent'
import { usePositionDetailSheets } from './usePositionDetailSheets'

const SNAPSHOT_STALE_THRESHOLD_MS = 5 * 60 * 1000

function isSnapshotStale(timestamp: string | undefined): boolean {
  if (!timestamp) return false
  const age = Date.now() - new Date(timestamp).getTime()
  return Number.isFinite(age) && age > SNAPSHOT_STALE_THRESHOLD_MS
}

function activeLegToSummary(detail: ReturnType<typeof usePosition>['data']): ActiveLegSummary[] {
  if (!detail?.activeLeg) return []
  const leg = detail.activeLeg
  if (!isOptionInstrument(leg.instrumentType)) return []
  const instrumentType = leg.instrumentType
  return [
    {
      ticker: detail.position.ticker,
      expiration: leg.expiration,
      strike: leg.strike,
      instrumentType
    }
  ]
}

export function PositionDetailPage(): React.JSX.Element {
  const { id } = useParams<{ id: string }>()
  const { isLoading, isError, data } = usePosition(id)

  const legSummaries = useMemo(() => activeLegToSummary(data), [data])
  const optionSnapshotsQuery = useOptionSnapshots(legSummaries)
  const stockQuotesQuery = useStockQuotes(data ? [data.position.ticker] : [])
  const underlyingPrice = data
    ? (stockQuotesQuery.data?.[data.position.ticker]?.price ?? null)
    : null

  const activeSnapshot = useMemo(() => {
    if (!data?.activeLeg) return undefined
    const leg = data.activeLeg
    if (!optionSnapshotsQuery.data) return undefined
    try {
      const occ = buildOccSymbol({
        ticker: data.position.ticker,
        expiration: leg.expiration,
        strike: leg.strike,
        instrumentType: leg.instrumentType
      })
      return optionSnapshotsQuery.data[occ]
    } catch {
      return undefined
    }
  }, [data, optionSnapshotsQuery.data])

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
    handleOpenCoveredCallFromAssignment,
    rollCspOpen,
    handleRollCsp,
    handleCloseRollCsp,
    rollCcOpen,
    handleRollCc,
    handleCloseRollCc,
    rollPmccShortOpen,
    handleRollPmccShort,
    handleCloseRollPmccShort,
    rollPmccLeapsOpen,
    handleRollPmccLeaps,
    handleCloseRollPmccLeaps,
    pmccRollRecorded,
    handlePmccShortRollRecorded,
    handlePmccLeapsRollRecorded
  } = usePositionDetailSheets(data)

  if (isLoading) {
    return <LoadingState message="Loading position..." />
  }

  if (isError || !data) {
    return (
      <div className="my-4 mx-6">
        <ErrorAlert message="Failed to load position." />
      </div>
    )
  }

  const { position, activeLeg, costBasisSnapshot, legs, pmccOpenLegs, pmccLedger } = data
  const ccExpired =
    position.phase === 'CC_OPEN' && activeLeg ? computeDte(activeLeg.expiration) <= 0 : false
  const assignLeg = legs.find((leg) => leg.legRole === 'ASSIGN')
  const leapsLedger = pmccLeapsLedger(pmccLedger)

  return (
    <PageLayout
      header={
        <PageHeader
          left={<Breadcrumb backTo="#/" backLabel="Positions" current={position.ticker} />}
          right={
            <PositionDetailActions
              strategyType={position.strategyType}
              phase={position.phase}
              hasOpenShortCall={Boolean(pmccOpenLegs?.short)}
              hasOpenLeaps={Boolean(pmccOpenLegs)}
              hasCostBasis={Boolean(costBasisSnapshot)}
              ccExpired={ccExpired}
              onOpenCc={handleOpenCc}
              onRecordAssignment={handleRecordAssignment}
              onRecordExpiration={handleRecordExpiration}
              onCloseCcEarly={handleCloseCcEarly}
              onRecordCallAway={handleRecordCallAway}
              onRecordCcExpiration={handleRecordCcExpiration}
              onRollCsp={handleRollCsp}
              onRollCc={handleRollCc}
              onRollPmccShort={handleRollPmccShort}
              onRollPmccLeaps={handleRollPmccLeaps}
            />
          }
        />
      }
    >
      {pmccRollRecorded && (
        <div className="px-6 pt-6">
          <PmccRollRecordedBanner recorded={pmccRollRecorded} />
        </div>
      )}
      <PositionDetailContent
        detail={data}
        overlayOpen={overlayOpen}
        snapshot={activeSnapshot}
        underlyingPrice={underlyingPrice}
        pnlStale={isSnapshotStale(activeSnapshot?.timestamp)}
      />
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
      {rollCspOpen && activeLeg && costBasisSnapshot && (
        <RollCspSheet
          open
          positionId={position.id}
          ticker={position.ticker}
          strike={activeLeg.strike}
          expiration={activeLeg.expiration}
          contracts={activeLeg.contracts}
          premiumPerContract={activeLeg.premiumPerContract}
          basisPerShare={costBasisSnapshot.basisPerShare}
          totalPremiumCollected={costBasisSnapshot.totalPremiumCollected}
          onClose={handleCloseRollCsp}
        />
      )}
      {rollCcOpen && activeLeg && costBasisSnapshot && (
        <RollCcSheet
          open
          positionId={position.id}
          ticker={position.ticker}
          strike={activeLeg.strike}
          expiration={activeLeg.expiration}
          contracts={activeLeg.contracts}
          premiumPerContract={activeLeg.premiumPerContract}
          basisPerShare={costBasisSnapshot.basisPerShare}
          totalPremiumCollected={costBasisSnapshot.totalPremiumCollected}
          onClose={handleCloseRollCc}
        />
      )}
      {rollPmccShortOpen && pmccOpenLegs?.short && leapsLedger && (
        <RollPmccShortCallSheet
          positionId={position.id}
          ticker={position.ticker}
          openShort={pmccOpenLegs.short}
          leaps={pmccOpenLegs.long}
          basisPerShare={leapsLedger.basisPerShare}
          effectiveShareCost={leapsLedger.effectiveShareCost}
          onClose={handleCloseRollPmccShort}
          onRecorded={handlePmccShortRollRecorded}
        />
      )}
      {rollPmccLeapsOpen && pmccOpenLegs && leapsLedger && (
        <RollPmccLeapsSheet
          positionId={position.id}
          ticker={position.ticker}
          leaps={pmccOpenLegs.long}
          openShort={pmccOpenLegs.short}
          lastEventDate={latestFillDate(legs)}
          ledger={leapsLedger}
          onClose={handleCloseRollPmccLeaps}
          onRecorded={handlePmccLeapsRollRecorded}
        />
      )}
    </PageLayout>
  )
}
