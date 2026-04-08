# Data Model: US-12 Refactor

No new entities, migrations, or schema changes. This refactor operates on existing data structures.

## Active Leg Resolution Logic (extracted)

The "active leg" for a position is the most recent leg matching these phase-to-role rules:

| Position Phase | Eligible Leg Roles |
|---|---|
| `CSP_OPEN` | `CSP_OPEN`, `ROLL_TO` |
| `CC_OPEN` | `CC_OPEN`, `ROLL_TO` |
| All other phases | No active leg (returns null) |

Tie-breaking: `ORDER BY fill_date DESC, created_at DESC LIMIT 1`

This logic currently exists only in `get-position.ts`. It must be shared with `list-positions.ts` (which currently lacks `ROLL_TO` handling).

## Roll Helper Types (new, renderer-side)

```typescript
type RollType = 'Roll Down & Out' | 'Roll Up & Out' | 'Roll Out'

type NetCreditDebit = {
  net: number           // positive = credit, negative = debit
  isCredit: boolean
  perContract: number   // absolute value
  total: number         // absolute value × contracts × 100
}

type RollCreditDebitColors = {
  color: string         // var(--wb-green) or var(--wb-gold)
  bg: string
  border: string
}
```

## RollCspSheet Form Schema (new, renderer-side)

```typescript
// Zod schema for form validation (string inputs, parsed on submit)
const RollCspFormSchema = z.object({
  cost_to_close: z.string().refine(v => parseFloat(v) > 0, 'Cost to close must be greater than zero'),
  new_premium: z.string().refine(v => parseFloat(v) > 0, 'New premium must be greater than zero'),
  new_expiration: z.string().min(1, 'New expiration is required'),
  new_strike: z.string().refine(v => parseFloat(v) > 0, 'Strike must be greater than zero'),
  fill_date: z.string().optional()
})
```

The `new_expiration > current_expiration` constraint requires a dynamic schema factory (like `CloseCspForm`'s `makeCloseCspSchema`).
