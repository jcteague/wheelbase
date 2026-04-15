import { useCallback, useMemo, useState } from 'react'
import type { PositionDetail } from '../api/positions'

type PositionActiveLeg = NonNullable<PositionDetail['activeLeg']>
type PositionSnapshot = NonNullable<PositionDetail['costBasisSnapshot']>
type PositionLeg = PositionDetail['legs'][number]

type ActiveLegSheetContext = {
  activeLeg: PositionActiveLeg
  snapshot: PositionSnapshot
}

type OpenCoveredCallContext = {
  basisPerShare: string
  totalPremiumCollected: string
  contracts: number
  assignmentDate: string
}

type CloseCoveredCallContext = {
  contracts: number
  openPremium: string
  ccOpenFillDate: string
  ccExpiration: string
  strike: string
  basisPerShare: string
}

type CallAwayContext = {
  ccStrike: string
  ccExpiration: string
  contracts: number
  basisPerShare: string
  positionOpenedDate: string
}

type PositionDetailSheetsResult = {
  assignmentWaterfall: Array<{ label: string; amount: string }>
  overlayOpen: boolean
  expirationCtx: ActiveLegSheetContext | null
  assignmentCtx: ActiveLegSheetContext | null
  openCcCtx: OpenCoveredCallContext | null
  closeCcCtx: CloseCoveredCallContext | null
  callAwayCtx: CallAwayContext | null
  ccExpirationCtx: ActiveLegSheetContext | null
  handleOpenCc: () => void
  handleRecordAssignment: () => void
  handleRecordExpiration: () => void
  handleCloseCcEarly: () => void
  handleRecordCallAway: () => void
  handleRecordCcExpiration: () => void
  handleCloseExpiration: () => void
  handleCloseAssignment: () => void
  handleCloseOpenCc: () => void
  handleCloseCloseCcEarly: () => void
  handleCloseCallAway: () => void
  handleCloseCcExpiration: () => void
  handleOpenCoveredCallFromAssignment: (nextContext: OpenCoveredCallContext) => void
  rollCspOpen: boolean
  handleRollCsp: () => void
  handleCloseRollCsp: () => void
  rollCcOpen: boolean
  handleRollCc: () => void
  handleCloseRollCc: () => void
}

function getActiveLegSheetContext(data: PositionDetail | undefined): ActiveLegSheetContext | null {
  if (!data?.activeLeg || !data.costBasisSnapshot) {
    return null
  }

  return {
    activeLeg: data.activeLeg,
    snapshot: data.costBasisSnapshot
  }
}

function getCoveredCallLeg(
  data: PositionDetail | undefined
): PositionLeg | PositionActiveLeg | null {
  return (
    data?.legs.find((leg) => leg.legRole === 'CC_OPEN') ??
    (data?.activeLeg?.legRole === 'CC_OPEN' ? data.activeLeg : null)
  )
}

function getAssignmentWaterfall(
  data: PositionDetail | undefined
): Array<{ label: string; amount: string }> {
  if (!data?.activeLeg) {
    return []
  }

  const premiumWaterfall = data.legs
    .filter((leg) => leg.legRole === 'CSP_OPEN' || leg.legRole === 'ROLL_TO')
    .map((leg) => ({
      label: leg.legRole === 'ROLL_TO' ? 'Roll credit' : 'CSP premium',
      amount: leg.premiumPerContract
    }))

  return premiumWaterfall.length > 0
    ? premiumWaterfall
    : [{ label: 'CSP premium', amount: data.activeLeg.premiumPerContract }]
}

export function usePositionDetailSheets(
  data: PositionDetail | undefined
): PositionDetailSheetsResult {
  const [expirationCtx, setExpirationCtx] = useState<ActiveLegSheetContext | null>(null)
  const [assignmentCtx, setAssignmentCtx] = useState<ActiveLegSheetContext | null>(null)
  const [openCcCtx, setOpenCcCtx] = useState<OpenCoveredCallContext | null>(null)
  const [closeCcCtx, setCloseCcCtx] = useState<CloseCoveredCallContext | null>(null)
  const [callAwayCtx, setCallAwayCtx] = useState<CallAwayContext | null>(null)
  const [ccExpirationCtx, setCcExpirationCtx] = useState<ActiveLegSheetContext | null>(null)
  const [rollCspOpen, setRollCspOpen] = useState(false)
  const [rollCcOpen, setRollCcOpen] = useState(false)

  const assignmentWaterfall = useMemo(() => getAssignmentWaterfall(data), [data])
  const overlayOpen =
    [expirationCtx, assignmentCtx, openCcCtx, closeCcCtx, callAwayCtx, ccExpirationCtx].some(
      (sheetCtx) => sheetCtx !== null
    ) ||
    rollCspOpen ||
    rollCcOpen

  const handleOpenCc = useCallback(() => {
    const assignLeg = data?.legs.find((leg) => leg.legRole === 'ASSIGN')
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
    const nextContext = getActiveLegSheetContext(data)
    if (nextContext) {
      setAssignmentCtx(nextContext)
    }
  }, [data])

  const handleRecordExpiration = useCallback(() => {
    const nextContext = getActiveLegSheetContext(data)
    if (nextContext) {
      setExpirationCtx(nextContext)
    }
  }, [data])

  const handleCloseCcEarly = useCallback(() => {
    const activeCcLeg = getCoveredCallLeg(data)
    const snapshot = data?.costBasisSnapshot

    if (activeCcLeg && snapshot) {
      setCloseCcCtx({
        contracts: activeCcLeg.contracts,
        openPremium: activeCcLeg.premiumPerContract,
        ccOpenFillDate: activeCcLeg.fillDate,
        ccExpiration: activeCcLeg.expiration,
        strike: activeCcLeg.strike,
        basisPerShare: snapshot.basisPerShare
      })
    }
  }, [data])

  const handleRecordCallAway = useCallback(() => {
    const activeCcLeg = getCoveredCallLeg(data)
    const snapshot = data?.costBasisSnapshot

    if (activeCcLeg && snapshot && data?.position) {
      setCallAwayCtx({
        ccStrike: activeCcLeg.strike,
        ccExpiration: activeCcLeg.expiration,
        contracts: activeCcLeg.contracts,
        basisPerShare: snapshot.basisPerShare,
        positionOpenedDate: data.position.openedDate
      })
    }
  }, [data])

  const handleRecordCcExpiration = useCallback(() => {
    const nextContext = getActiveLegSheetContext(data)
    if (nextContext) {
      setCcExpirationCtx(nextContext)
    }
  }, [data])

  return {
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
    handleCloseExpiration: () => setExpirationCtx(null),
    handleCloseAssignment: () => setAssignmentCtx(null),
    handleCloseOpenCc: () => setOpenCcCtx(null),
    handleCloseCloseCcEarly: () => setCloseCcCtx(null),
    handleCloseCallAway: () => setCallAwayCtx(null),
    handleCloseCcExpiration: () => setCcExpirationCtx(null),
    handleOpenCoveredCallFromAssignment: (nextContext: OpenCoveredCallContext) => {
      setAssignmentCtx(null)
      setOpenCcCtx(nextContext)
    },
    rollCspOpen,
    handleRollCsp: () => setRollCspOpen(true),
    handleCloseRollCsp: () => setRollCspOpen(false),
    rollCcOpen,
    handleRollCc: () => setRollCcOpen(true),
    handleCloseRollCc: () => setRollCcOpen(false)
  }
}
