import { useLocation, useSearch } from 'wouter'
import { NewWheelForm } from '../components/NewWheelForm'
import { PageHeader, PageLayout } from '../components/PageLayout'
import { Breadcrumb } from '../components/ui/Breadcrumb'

function NewWheelHeader(): React.JSX.Element {
  return (
    <PageHeader left={<Breadcrumb backTo="#/" backLabel="Positions" current="Open New Wheel" />} />
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
