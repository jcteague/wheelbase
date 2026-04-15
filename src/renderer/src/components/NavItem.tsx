type NavItemProps = {
  href: string
  label: string
  icon: string
  active: boolean
}

export function NavItem({ href, label, icon, active }: NavItemProps): React.JSX.Element {
  return (
    <a
      href={`#${href}`}
      className="wb-nav-link flex items-center gap-[10px] px-[12px] py-[10px] rounded text-sm transition-colors font-wb-mono no-underline"
      style={{
        color: active ? 'var(--wb-gold)' : undefined,
        background: active ? 'var(--wb-gold-dim)' : undefined
      }}
    >
      <span className="text-xs opacity-70">{icon}</span>
      <span>{label}</span>
    </a>
  )
}
