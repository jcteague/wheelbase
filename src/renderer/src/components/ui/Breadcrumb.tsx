type BreadcrumbProps = {
  backTo: string
  backLabel: string
  current: string
}

export function Breadcrumb({ backTo, backLabel, current }: BreadcrumbProps): React.JSX.Element {
  return (
    <div className="flex items-center gap-[10px]">
      <a
        href={backTo}
        className="wb-nav-link flex items-center gap-[5px] text-xs no-underline font-wb-mono"
      >
        ← {backLabel}
      </a>
      <span className="text-wb-text-muted select-none">/</span>
      <span className="font-wb-mono font-bold text-sm tracking-[0.04em] text-wb-text-primary">
        {current}
      </span>
    </div>
  )
}
