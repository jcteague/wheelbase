import { useParams } from 'wouter'

export function PositionDetailPage(): React.JSX.Element {
  const { id } = useParams<{ id: string }>()
  return (
    <main>
      <h1>Position {id}</h1>
      <p>Position detail — coming soon.</p>
    </main>
  )
}
