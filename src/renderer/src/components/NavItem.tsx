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
      className="wb-nav-link flex items-center gap-2.5 px-3 py-2.5 rounded text-sm transition-colors"
      style={{
        color: active ? 'var(--wb-gold)' : undefined,
        background: active ? 'var(--wb-gold-dim)' : 'transparent',
        textDecoration: 'none',
        ['--wb-nav-link-color' as string]: active ? 'var(--wb-gold)' : 'var(--wb-text-secondary)',
        ['--wb-nav-link-hover-color' as string]: active
          ? 'var(--wb-gold)'
          : 'var(--wb-text-primary)'
      }}
    >
      <span style={{ fontSize: '0.75rem', opacity: 0.7 }}>{icon}</span>
      <span>{label}</span>
    </a>
  )
}
