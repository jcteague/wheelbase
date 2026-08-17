import { useEffect, useState } from 'react'
import { useLocation, useSearch } from 'wouter'
import { NewWheelForm } from '../components/NewWheelForm'
import { PageHeader, PageLayout } from '../components/PageLayout'
import { Breadcrumb } from '../components/ui/Breadcrumb'
import { parsePromotedParams } from '../lib/promote'

function NewWheelHeader(): React.JSX.Element {
  return (
    <PageHeader left={<Breadcrumb backTo="#/" backLabel="Positions" current="Open New Wheel" />} />
  )
}

export function NewWheelPage(): React.JSX.Element {
  const [, navigate] = useLocation()
  const search = useSearch()
  // [US-68] A screener promote carries the whole candidate; anything else (including
  // a malformed promote) falls back to the plain form, honouring a bare `?ticker=`.
  //
  // Read once and held: wouter's hash `navigate` writes the query into the real
  // `location.search` and never clears it, so without the consume-on-mount below the
  // params outlive the promote — the next plain "Open Wheel" from the sidebar would
  // re-open this form pre-filled from a stale candidate, provenance and re-fetch and all.
  const [promoted] = useState(() => parsePromotedParams(search) ?? undefined)
  const defaultTicker = new URLSearchParams(search).get('ticker') ?? undefined

  // Keyed off the raw params, not the parsed result: a *malformed* promote is
  // consumed here too. Left behind, its `ticker=` would still pre-fill the next
  // plain "Open Wheel" — the same resurrection, one branch over.
  const carriesPromote = new URLSearchParams(search).has('promoted')

  useEffect(() => {
    if (!carriesPromote) return
    // Drop the query while keeping the hash route. `replaceState` fires no
    // hashchange, so this mount keeps the payload it already parsed.
    window.history.replaceState(null, '', `${window.location.pathname}${window.location.hash}`)
  }, [carriesPromote])

  return (
    <PageLayout header={<NewWheelHeader />} contentStyle={{ padding: '28px 32px' }}>
      <div style={{ maxWidth: 560 }}>
        <NewWheelForm navigate={navigate} defaultTicker={defaultTicker} promoted={promoted} />
      </div>
    </PageLayout>
  )
}
