import React from 'react'

type ScreenerTone = 'error' | 'neutral'

const TONE: Record<ScreenerTone, { glyph: string; cardClass: string; glyphClass: string }> = {
  error: {
    glyph: '⚠',
    cardClass: 'border-wb-red/30',
    glyphClass: 'bg-wb-red-dim text-wb-red'
  },
  neutral: {
    glyph: '⌕',
    cardClass: 'border-wb-border',
    glyphClass: 'bg-wb-bg-elevated text-wb-text-muted'
  }
}

type ScreenerStateCardProps = {
  tone: ScreenerTone
  title: string
  body: string
  actionLabel?: string
  onAction?: () => void
  /** Keeps the action visible but inert when it cannot do anything yet. */
  actionDisabled?: boolean
  caption?: string
  'data-testid'?: string
}

export function ScreenerStateCard({
  tone,
  title,
  body,
  actionLabel,
  onAction,
  actionDisabled = false,
  caption,
  'data-testid': testId
}: ScreenerStateCardProps): React.JSX.Element {
  const { glyph, cardClass, glyphClass } = TONE[tone]

  return (
    <div className="flex flex-col gap-3">
      <div
        data-testid={testId}
        data-tone={tone}
        className={`flex flex-col items-center gap-3 rounded-lg border bg-wb-bg-surface px-6 py-12 text-center ${cardClass}`}
      >
        <span
          className={`flex h-10 w-10 items-center justify-center rounded-full text-[1.1rem] ${glyphClass}`}
        >
          {glyph}
        </span>
        <div className="text-base font-semibold text-wb-text-primary">{title}</div>
        <div className="max-w-[380px] text-[0.82rem] leading-relaxed text-wb-text-secondary">
          {body}
        </div>
        {actionLabel ? (
          <button
            type="button"
            onClick={onAction}
            disabled={actionDisabled}
            className="mt-1.5 cursor-pointer rounded-lg border border-wb-border bg-wb-bg-elevated px-4 py-[7px] font-wb-mono text-[0.72rem] text-wb-text-primary disabled:cursor-not-allowed disabled:opacity-50"
          >
            {actionLabel}
          </button>
        ) : null}
      </div>
      {caption ? (
        <p className="font-wb-mono text-[0.7rem] leading-relaxed text-wb-text-muted">{caption}</p>
      ) : null}
    </div>
  )
}
