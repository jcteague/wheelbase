import { Caption } from '../ui/Caption'

/** The owner caption at the top of a cockpit drawer body, e.g. `US-103 · cash ledger, never a quote`. */
export function DrawerCaption({ children }: { children: React.ReactNode }): React.JSX.Element {
  return (
    <div className="px-5 pt-3">
      <Caption>{children}</Caption>
    </div>
  )
}
