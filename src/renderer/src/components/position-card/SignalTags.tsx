import type { PmccTag } from '../../../../main/core/pmcc-card'
import { TONE_TEXT_CLASS } from './styles'

/** The PMCC header's awareness tags (⚑ δ ⚠), in registry order; nothing when none fire. */
export function SignalTags({ tags }: { tags: PmccTag[] }): React.JSX.Element | null {
  if (tags.length === 0) return null
  return (
    <span data-testid="pmcc-awareness-tags" className="inline-flex items-center gap-[5px]">
      {tags.map((tag) => (
        <span
          key={tag.glyph}
          role="img"
          aria-label={tag.name}
          title={tag.tooltip}
          className={`cursor-help text-[11.5px] leading-none ${TONE_TEXT_CLASS[tag.tone]}`}
        >
          {tag.glyph}
        </span>
      ))}
    </span>
  )
}
