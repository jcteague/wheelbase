type ExpiringSoonFlagProps = {
  compact?: boolean
}

export function ExpiringSoonFlag({ compact = false }: ExpiringSoonFlagProps): React.JSX.Element {
  return (
    <span
      data-testid="expiring-soon-flag"
      className={[
        'inline-flex items-center gap-[5px] rounded-full font-wb-mono font-bold uppercase',
        'tracking-[0.09em] whitespace-nowrap bg-wb-gold-dim text-wb-gold border border-wb-gold-border',
        compact ? 'text-[0.58rem] px-[7px] py-[1px]' : 'text-[0.62rem] px-2 py-0.5'
      ].join(' ')}
    >
      <span className="w-[5px] h-[5px] shrink-0 rounded-full bg-wb-gold" />
      Expiring soon
    </span>
  )
}
