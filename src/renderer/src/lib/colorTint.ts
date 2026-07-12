export type ColorTint = {
  background: string
  border: string
  color: string
}

/** Derives a translucent background/border tint from a solid hex color, for badge/chip-style UI. */
export function tintFromColor(color: string): ColorTint {
  return {
    background: `${color}18`,
    border: `1px solid ${color}30`,
    color
  }
}
