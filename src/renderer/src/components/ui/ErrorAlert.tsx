type ErrorAlertProps = {
  children?: React.ReactNode
  message?: React.ReactNode
}

export function ErrorAlert({ children, message }: ErrorAlertProps): React.JSX.Element {
  return (
    <div
      role="alert"
      className="py-2.5 px-3.5 rounded-md bg-wb-red-dim text-wb-red text-[0.8125rem] font-wb-mono"
      style={{ border: '1px solid rgba(248, 81, 73, 0.25)' }}
    >
      {children ?? message}
    </div>
  )
}
