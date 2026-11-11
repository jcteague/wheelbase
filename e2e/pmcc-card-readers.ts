// [US-108] Readers for the PMCC position card: locators for its regions and the plain strings
// and attributes the e2e spec asserts on. No expectations live here.
import type { Locator, Page } from 'playwright'
import { cardFor, childTexts, legOf, stripChip, stripLine } from './position-card-helpers'

export function xyzCard(page: Page): Locator {
  return cardFor(page, 'XYZ')
}

/** One leg block's parts: the L/S tag, action marks, title, DTE, mark and trailing cue. */
export interface LegParts {
  tag: string
  marks: string
  title: string
  dte: string
  mark: string
  trailing: string
}

export async function legParts(leg: Locator): Promise<LegParts> {
  return leg.evaluate((el) => {
    const [tag, title, dte, value] = Array.from(el.children)
    const text = (node: Element | null | undefined): string => node?.textContent ?? ''
    const marks = text(title.querySelector(':scope > span[title]'))
    const mark = text(value.querySelector('[data-testid="leg-mark"]'))
    return {
      tag: text(tag),
      marks,
      title: text(title).slice(marks.length),
      dte: text(dte),
      mark,
      trailing: text(value).slice(mark.length)
    }
  })
}

/** A leg block's action-mark glyphs, whose title is the tooltips joined by newlines. */
export function legMarks(leg: Locator): Locator {
  return leg.locator(':scope > :nth-child(2) > span[title]')
}

/** A leg block's DTE text element. */
export function legDte(leg: Locator): Locator {
  return leg.locator(':scope > :nth-child(3) > span')
}

/** The header's awareness tags, in render order. */
export function awarenessTags(card: Locator): Locator {
  return card.getByTestId('pmcc-awareness-tags').getByRole('img')
}

export function detailBar(card: Locator): Locator {
  return card.locator('button[aria-expanded]')
}

export function tier2Cells(card: Locator): Locator {
  return card.getByTestId('tier2-cell')
}

/** Tier 2 as `[label, value, note]` rows. */
export async function tier2Rows(card: Locator): Promise<string[][]> {
  return tier2Cells(card).evaluateAll((cells) =>
    cells.map((cell) => Array.from(cell.children).map((child) => child.textContent ?? ''))
  )
}

export function recoveryMeter(card: Locator): Locator {
  return card.getByTestId('recovery-meter')
}

/** The Net P&L figure element (the ⚠ span, when shown, sits inside it). */
export function pnlFigure(card: Locator): Locator {
  return card.getByTestId('position-card-XYZ-pnl').locator(':scope > :first-child')
}

/** A footer cell (`Cost basis`, `Credits collected`): label, value, sub line. */
export function footerCellOf(card: Locator, label: string): Locator {
  return card.locator('div.grid-cols-2 > div').filter({
    has: card.page().getByText(label, { exact: true })
  })
}

/** A footer cell's `[value, sub]` by its label. */
export async function footerCell(card: Locator, label: string): Promise<[string, string]> {
  const [, value, sub] = await childTexts(footerCellOf(card, label))
  return [value, sub]
}

export function leapsBlock(card: Locator): Locator {
  return legOf(card).nth(0)
}

export function shortBlock(card: Locator): Locator {
  return legOf(card).nth(1)
}

/** The header row's ticker, badge and tag texts, in DOM order. */
export async function headerLead(card: Locator): Promise<string[]> {
  const texts = await childTexts(card.getByTestId('position-ticker').locator('..'))
  return texts.slice(0, 3)
}

export async function highlightedLegs(card: Locator): Promise<number> {
  return card.locator('[data-testid="leg-block"][data-action]').count()
}

export async function tagFacts(
  card: Locator
): Promise<{ label: string; text: string; title: string }[]> {
  return awarenessTags(card).evaluateAll((tags) =>
    tags.map((tag) => ({
      label: tag.getAttribute('aria-label') ?? '',
      text: tag.textContent ?? '',
      title: tag.getAttribute('title') ?? ''
    }))
  )
}

/** The strip's tone, lead line, chip, which legs it highlights and the card's edge. */
export async function stripFacts(card: Locator): Promise<{
  tone: string | null
  line: string
  chip: string | null
  leapsAction: string | null
  shortAction: string | null
  edge: string | null
}> {
  const chip = stripChip(card)
  return {
    tone: await card.getByTestId('action-strip').getAttribute('data-tone'),
    line: await stripLine(card),
    chip: (await chip.count()) === 0 ? null : await chip.getAttribute('title'),
    leapsAction: await leapsBlock(card).getAttribute('data-action'),
    shortAction: await shortBlock(card).getAttribute('data-action'),
    edge: await card.getAttribute('data-edge')
  }
}
