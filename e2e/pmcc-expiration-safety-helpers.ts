// [US-102] Shared assertions and drafts for both expiration-safety roll directions.
import { expect } from 'vitest'
import type { Page } from 'playwright'
import { localToday } from './dates'
import { fieldOf } from './pmcc-helpers'
import {
  confirmButton,
  fieldError,
  fillLeapsRoll,
  fillRoll,
  rollLeaps,
  rollSheet,
  rollShortCall,
  testIdText,
  type RollSheetKind
} from './pmcc-roll-helpers'

export const SHORT_ERROR = 'Short call must expire before the LEAPS call.'
export const LEAPS_ERROR = 'LEAPS call must expire after the short call.'

export async function expectBlockedDraft(
  page: Page,
  kind: RollSheetKind,
  expiration: string
): Promise<void> {
  const prefix = kind === 'short' ? 'pmcc-roll' : 'pmcc-leaps-roll'
  expect(await fieldError(page, `${prefix}-expiration`)).toBe(
    kind === 'short' ? SHORT_ERROR : LEAPS_ERROR
  )
  expect(
    await fieldOf(page, `${prefix}-expiration`).getByRole('alert').getAttribute('class')
  ).toContain('text-wb-red')
  await expect.poll(() => confirmButton(page, kind).isDisabled()).toBe(true)
  expect(await confirmButton(page, kind).getAttribute('class')).toContain('opacity-40')
  expect(await confirmButton(page, kind).getAttribute('class')).toContain('cursor-not-allowed')
  expect(await page.locator(`#${prefix}-expiration`).textContent()).toContain(expiration)
  expect(await page.locator(`#${prefix}-fill-date`).textContent()).toContain(localToday())
  expect(await page.locator(`#${prefix}-contracts`).inputValue()).toBe('1')
  expect(await page.locator(`#${prefix}-strike`).inputValue()).toBe(kind === 'short' ? '112' : '85')
  const cash =
    kind === 'short'
      ? ['cost-to-close', 'premium', '3.00', '2.40']
      : ['proceeds', 'debit', '26.00', '23.50']
  expect(await page.locator(`#${prefix}-${cash[0]}`).inputValue()).toBe(cash[2])
  expect(await page.locator(`#${prefix}-${cash[1]}`).inputValue()).toBe(cash[3])
  expect(await testIdText(page, `${prefix}-net`)).toBe(
    kind === 'short'
      ? 'Net Debit: $0.60 per share ($60.00 total)'
      : 'Net Credit: $2.50 per share ($250.00 total)'
  )
  expect(await rollSheet(page, kind).isVisible()).toBe(true)
  expect(await page.getByTestId(`${prefix}-recorded-banner`).count()).toBe(0)
}

export async function fillSafetyRoll(
  page: Page,
  kind: RollSheetKind,
  expiration: string,
  fillDate = localToday()
): Promise<void> {
  if (kind === 'short') {
    await fillRoll(page, {
      costToClose: '3.00',
      strike: '112',
      expiration,
      premium: '2.40',
      fillDate
    })
  } else {
    await fillLeapsRoll(page, {
      proceeds: '26.00',
      strike: '85',
      expiration,
      debit: '23.50',
      fillDate
    })
  }
}

export async function expectServerRejection(
  page: Page,
  positionId: string,
  kind: RollSheetKind,
  newExpiration: string
): Promise<void> {
  const result =
    kind === 'short'
      ? await rollShortCall(page, {
          positionId,
          costToClosePerContract: 3,
          newPremiumPerContract: 2.4,
          newStrike: 112,
          newExpiration,
          fillDate: localToday()
        })
      : await rollLeaps(page, {
          positionId,
          proceedsPerContract: 26,
          replacementDebitPerContract: 23.5,
          newStrike: 85,
          newExpiration,
          fillDate: localToday()
        })
  expect(result).toEqual({
    ok: false,
    errors: [
      {
        field: 'newExpiration',
        code: kind === 'short' ? 'short_not_before_long' : 'long_not_after_short',
        message: kind === 'short' ? SHORT_ERROR : LEAPS_ERROR
      }
    ]
  })
}
