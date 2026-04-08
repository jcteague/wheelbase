// Returns the SQL subquery string for finding the current open leg for a
// position, phase-aware:
//   CSP_OPEN phase → CSP_OPEN or ROLL_TO legs
//   CC_OPEN phase  → CC_OPEN  or ROLL_TO legs
//   Other phases   → no match (returns null via LEFT JOIN)
export function activeLegSubquery(): string {
  return `SELECT id FROM legs
    WHERE position_id = p.id
      AND (
        (p.phase = 'CSP_OPEN' AND leg_role IN ('CSP_OPEN', 'ROLL_TO'))
        OR (p.phase = 'CC_OPEN' AND leg_role IN ('CC_OPEN', 'ROLL_TO'))
      )
    ORDER BY fill_date DESC, created_at DESC
    LIMIT 1`
}
