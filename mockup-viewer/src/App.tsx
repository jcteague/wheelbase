import React, { useState, useEffect, Suspense } from 'react'

type MockupEntry = {
  filename: string
  title: string
  loader: () => Promise<{ default: React.ComponentType; frontmatter?: Record<string, string> }>
}

const mockupModules = import.meta.glob<{
  default: React.ComponentType
  frontmatter?: Record<string, string>
}>('../../mockups/*.mdx')

const mockups: MockupEntry[] = Object.entries(mockupModules).map(([path, loader]) => {
  const filename = path.split('/').pop()!.replace('.mdx', '')
  return { filename, title: filename, loader }
})

function EmptyState(): React.JSX.Element {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100%',
        gap: '0.75rem',
        color: 'var(--muted-foreground)'
      }}
    >
      <p style={{ fontSize: '0.875rem' }}>No mockups yet.</p>
      <p style={{ fontSize: '0.75rem' }}>
        Run <code style={{ color: 'var(--wb-gold)' }}>/product-owner</code> to generate user stories
        and mockups.
      </p>
    </div>
  )
}

export default function App(): React.JSX.Element {
  const [selected, setSelected] = useState<string | null>(mockups[0]?.filename ?? null)
  const [MdxContent, setMdxContent] = useState<React.ComponentType | null>(null)

  useEffect(() => {
    const mockup = mockups.find((m) => m.filename === selected)
    if (!mockup) return
    mockup.loader().then((mod) => {
      setMdxContent(() => mod.default)
    })
  }, [selected])

  return (
    <div
      style={{
        display: 'flex',
        height: '100vh',
        background: 'var(--background)',
        color: 'var(--foreground)',
        overflow: 'hidden'
      }}
    >
      {/* Sidebar */}
      <aside
        style={{
          width: 240,
          flexShrink: 0,
          borderRight: '1px solid var(--border)',
          padding: '1rem',
          overflowY: 'auto',
          display: 'flex',
          flexDirection: 'column',
          gap: '0.25rem'
        }}
      >
        <p
          style={{
            fontSize: '0.6875rem',
            fontWeight: 700,
            color: 'var(--muted-foreground)',
            textTransform: 'uppercase',
            letterSpacing: '0.08em',
            marginBottom: '0.5rem'
          }}
        >
          Mockups
        </p>
        {mockups.length === 0 && (
          <p style={{ color: 'var(--muted-foreground)', fontSize: '0.8125rem' }}>
            No mockups found.
          </p>
        )}
        {mockups.map((m) => {
          const isSelected = selected === m.filename
          return (
            <button
              key={m.filename}
              onClick={() => setSelected(m.filename)}
              style={{
                display: 'block',
                width: '100%',
                textAlign: 'left',
                padding: '0.4rem 0.625rem',
                borderRadius: 'var(--radius)',
                border: 'none',
                cursor: 'pointer',
                fontSize: '0.8125rem',
                background: isSelected ? 'var(--accent)' : 'transparent',
                color: isSelected ? 'var(--accent-foreground)' : 'var(--muted-foreground)',
                fontFamily: 'inherit'
              }}
            >
              {m.filename}
            </button>
          )
        })}
      </aside>

      {/* Content */}
      <main style={{ flex: 1, overflowY: 'auto', padding: '2rem' }}>
        <Suspense fallback={<div style={{ color: 'var(--muted-foreground)' }}>Loading…</div>}>
          {mockups.length === 0 ? (
            <EmptyState />
          ) : MdxContent ? (
            <MdxContent />
          ) : (
            <div style={{ color: 'var(--muted-foreground)' }}>Select a mockup</div>
          )}
        </Suspense>
      </main>
    </div>
  )
}
