import { useLocation } from 'wouter'
import { NewWheelForm } from '../components/NewWheelForm'

export function NewWheelPage(): React.JSX.Element {
  const [, navigate] = useLocation()
  return (
    <main>
      <h1>Open a New Wheel</h1>
      <NewWheelForm navigate={navigate} />
    </main>
  )
}
