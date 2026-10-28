export type LegTagValue = 'P' | 'C' | '·' | 'L' | 'S'

const TAG_CLASS: Record<LegTagValue, string> = {
  P: 'text-wb-gold border-wb-gold-border bg-wb-gold-dim',
  C: 'text-wb-violet border-wb-violet/40 bg-wb-violet-dim',
  '·': 'text-wb-text-muted border-wb-border bg-wb-bg-elevated',
  L: 'text-wb-sky border-wb-sky/40 bg-wb-sky/10',
  S: 'text-wb-violet border-wb-violet/40 bg-wb-violet-dim'
}

const TAG_TIP: Record<LegTagValue, string> = {
  P: 'Cash-secured put',
  C: 'Covered call',
  '·': 'No option leg open',
  L: 'LEAPS — long call, the synthetic stock',
  S: 'Short call — the income leg'
}

export function LegTag({ tag }: { tag: LegTagValue }): React.JSX.Element {
  return (
    <span
      title={TAG_TIP[tag]}
      className={`rounded-[3px] border px-1 py-px font-wb-mono text-[9px] font-bold tracking-[0.08em] ${TAG_CLASS[tag]}`}
    >
      {tag}
    </span>
  )
}
