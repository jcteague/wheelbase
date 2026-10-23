// [US-102] Existing roll workflows. S5/S6 belong to the real US-115 subsequent-short workflow.
// Run with TZ=America/New_York; relative dates preserve the story's calendar-day offsets.
import { afterEach, describe, expect, it } from 'vitest'
import type { ElectronApplication, Page } from 'playwright'
import { localDate } from './dates'
import { reachCcOpenState, selectDate } from './helpers'
import { closePmcc, launchPmcc, listPositions, tempDbPath } from './pmcc-helpers'
import { createXyzPmcc, openXyzDetail } from './pmcc-ledger-helpers'
import {
  confirmButton,
  dteOf,
  LEAPS_EXP,
  openRollLeapsSheet,
  openRollShortSheet,
  positionDetail,
  reachXyzLeapsOnly,
  rollSheet,
  sectionValue,
  testIdText
} from './pmcc-roll-helpers'

import {
  expectBlockedDraft,
  expectServerRejection,
  fillSafetyRoll,
  LEAPS_ERROR,
  SHORT_ERROR
} from './pmcc-expiration-safety-helpers'

let app: ElectronApplication | undefined
let dbPath: string
const SHORT_EXP = localDate(32)

afterEach(async () => {
  await closePmcc(app, dbPath)
  app = undefined
})

async function launch(): Promise<Page> {
  dbPath = tempDbPath('pmcc-expiration-safety')
  const launched = await launchPmcc(dbPath, { env: { NODE_ENV: 'test' } })
  app = launched.app
  return launched.page
}

async function background(): Promise<{ page: Page; id: string }> {
  const page = await launch()
  const id = await createXyzPmcc(page)
  await openXyzDetail(page)
  return { page, id }
}

describe('US-102 — PMCC expiration safety', () => {
  const successfulRolls = [
    {
      name: 'Roll the short call to an expiration before the open LEAPS call',
      kind: 'short',
      days: 158
    },
    { name: 'Roll the LEAPS to an expiration after the open short call', kind: 'leaps', days: 494 }
  ] as const
  successfulRolls.forEach(({ name, kind, days }) => {
    it(name, async () => {
      const { page, id } = await background()
      const before = await positionDetail(page, id)
      if (kind === 'short') {
        await openRollShortSheet(page)
        expect(await sectionValue(page, kind, 'Current short call', 'LEAPS · read-only')).toBe(
          `$80.00 · ${LEAPS_EXP}`
        )
      } else {
        await openRollLeapsSheet(page)
        expect(await sectionValue(page, kind, 'Open short call', 'Expiration')).toBe(
          `${SHORT_EXP} (${dteOf(SHORT_EXP)} DTE)`
        )
      }
      await fillSafetyRoll(page, kind, localDate(days))
      const prefix = kind === 'short' ? 'pmcc-roll' : 'pmcc-leaps-roll'
      expect(await testIdText(page, `${prefix}-label`)).toContain(`${dteOf(localDate(days))} DTE`)
      expect(await page.getByTestId('pmcc-coverage-ruler').getAttribute('data-blocked')).toBe(
        'false'
      )
      await confirmButton(page, kind).click()
      await rollSheet(page, kind).waitFor({ state: 'detached' })
      await page.getByTestId(`${prefix}-recorded-banner`).waitFor()
      const after = await positionDetail(page, id)
      const replacement = kind === 'short' ? after.pmccOpenLegs?.short : after.pmccOpenLegs?.long
      expect(replacement?.expiration).toBe(localDate(days))
      const unchanged = kind === 'short' ? 'long' : 'short'
      expect(after.pmccOpenLegs?.[unchanged]).toEqual(before.pmccOpenLegs?.[unchanged])
      expect(after.legs).toHaveLength(before.legs.length + 2)
      expect(after.allSnapshots).toHaveLength(before.allSnapshots.length + 1)
    })
  })

  const rejectedRolls = [
    {
      name: 'Reject a short-call roll that would outlast or equal the LEAPS call — equal',
      kind: 'short',
      days: 368
    },
    {
      name: 'Reject a short-call roll that would outlast or equal the LEAPS call — later',
      kind: 'short',
      days: 396
    },
    {
      name: 'Reject a LEAPS roll that would no longer cover the open short call — equal',
      kind: 'leaps',
      days: 32
    },
    {
      name: 'Reject a LEAPS roll that would no longer cover the open short call — earlier',
      kind: 'leaps',
      days: 18
    }
  ] as const
  rejectedRolls.forEach(({ name, kind, days }) => {
    it(name, async () => {
      const { page, id } = await background()
      const before = await positionDetail(page, id)
      const expiration = localDate(days)
      if (kind === 'short') await openRollShortSheet(page)
      else await openRollLeapsSheet(page)
      await fillSafetyRoll(page, kind, expiration)
      await expectBlockedDraft(page, kind, expiration)
      await expectServerRejection(page, id, kind, expiration)
      // Includes the full persisted position, both original calls, every leg and every snapshot.
      expect(await positionDetail(page, id)).toEqual(before)
      expect(before.pmccOpenLegs?.short?.expiration).toBe(SHORT_EXP)
      expect(before.pmccOpenLegs?.long.expiration).toBe(LEAPS_EXP)
      await expectBlockedDraft(page, kind, expiration)
    })
  })

  it('Roll the LEAPS while no short call is open', async () => {
    const page = await launch()
    const id = await reachXyzLeapsOnly(page)
    const before = await positionDetail(page, id)
    await openRollLeapsSheet(page)
    expect(await rollSheet(page, 'leaps').textContent()).toContain('No short call open')
    await fillSafetyRoll(page, 'leaps', localDate(494), localDate(33))
    expect(await rollSheet(page, 'leaps').getByRole('alert').count()).toBe(0)
    await confirmButton(page, 'leaps').click()
    await rollSheet(page, 'leaps').waitFor({ state: 'detached' })
    const after = await positionDetail(page, id)
    expect(after.pmccOpenLegs?.short).toBeNull()
    expect(after.pmccOpenLegs?.long.expiration).toBe(localDate(494))
    expect(after.legs).toHaveLength(before.legs.length + 2)
    expect(after.allSnapshots).toHaveLength(before.allSnapshots.length + 1)
  })

  it('Reject a bypassed invalid PMCC roll without a partial history', async () => {
    const { page, id } = await background()
    const before = await positionDetail(page, id)
    await expectServerRejection(page, id, 'short', localDate(396))
    expect(await positionDetail(page, id)).toEqual(before)
    expect(before.legs).toHaveLength(2)
    expect(before.allSnapshots).toHaveLength(1)
    expect(await page.getByTestId('pmcc-roll-recorded-banner').count()).toBe(0)
  })

  it('Leave a classic wheel unaffected', async () => {
    const page = await launch()
    await reachCcOpenState(page, '185', '2.50', localDate(30))
    const [position] = await listPositions(page)
    const before = await positionDetail(page, position.id)
    await page.getByTestId('roll-cc-btn').click()
    await page.waitForSelector('text=Roll Covered Call')
    await page.fill('[aria-label="New Strike"]', '190')
    await selectDate(page, '[aria-label="New Expiration"]', localDate(60))
    await page.fill('[aria-label="Cost to Close"]', '3.50')
    await page.fill('[aria-label="New Premium"]', '4.20')
    await page.getByRole('button', { name: 'Confirm Roll', exact: true }).click()
    await page.waitForSelector('text=CC Rolled Successfully')
    const after = await positionDetail(page, position.id)
    expect(after.position.phase).toBe('CC_OPEN')
    expect(after.activeLeg).toMatchObject({
      strike: '190.0000',
      expiration: localDate(60),
      legRole: 'ROLL_TO'
    })
    expect(after.legs).toHaveLength(before.legs.length + 2)
    expect(after.allSnapshots).toHaveLength(before.allSnapshots.length + 1)
    expect(after.pmccOpenLegs).toBeNull()
    const text = (await page.textContent('body')) ?? ''
    expect(text).not.toContain(SHORT_ERROR)
    expect(text).not.toContain(LEAPS_ERROR)
  })
})
