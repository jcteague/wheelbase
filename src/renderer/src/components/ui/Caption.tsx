type CaptionProps = { children: React.ReactNode }

export function Caption({ children }: CaptionProps): React.JSX.Element {
  return (
    <span className="text-[0.65rem] font-semibold tracking-[0.1em] uppercase text-wb-text-muted font-wb-mono">
      {children}
    </span>
  )
}
