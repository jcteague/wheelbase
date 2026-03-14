import { useLocation, useSearch } from 'wouter'
import { NewWheelForm } from '../components/NewWheelForm'
import { PageHeader, PageLayout } from '../components/PageLayout'
import { MONO } from '../lib/tokens'

function NewWheelHeader(): React.JSX.Element {
  return (
    <PageHeader
      left={
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <a
            href="#/"
            className="wb-nav-link"
            style={{
              textDecoration: 'none',
              fontSize: '0.75rem',
              fontFamily: MONO,
              ['--wb-nav-link-color' as string]: 'var(--wb-text-muted)'
            }}
          >
            ← Positions
          </a>
          <span style={{ color: 'var(--wb-text-muted)', fontSize: '0.75rem' }}>/</span>
          <h1
            style={{
              fontSize: '0.875rem',
              fontWeight: 600,
              color: 'var(--wb-text-primary)',
              margin: 0
            }}
          >
            Open New Wheel
          </h1>
        </div>
      }
    />
  )
}

export function NewWheelPage(): React.JSX.Element {
  const [, navigate] = useLocation()
  const search = useSearch()
  const defaultTicker = new URLSearchParams(search).get('ticker') ?? undefined

  return (
    <PageLayout header={<NewWheelHeader />} contentStyle={{ padding: '28px 32px' }}>
      <div style={{ maxWidth: 560 }}>
        <NewWheelForm navigate={navigate} defaultTicker={defaultTicker} />
      </div>
    </PageLayout>
  )
}
