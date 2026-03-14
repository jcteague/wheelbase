-- Indexes to cover the correlated subqueries used by listPositions and getPosition.
--
-- "latest active leg" subquery filters by (position_id, leg_role) and orders by (fill_date DESC, created_at DESC).
-- The existing idx_legs_position_fill_date doesn't cover the leg_role filter.
CREATE INDEX idx_legs_position_role_date
  ON legs (position_id, leg_role, fill_date DESC, created_at DESC);

-- "latest snapshot" subquery filters by position_id and orders by snapshot_at DESC.
-- No index existed for this query.
CREATE INDEX idx_snapshots_position_at
  ON cost_basis_snapshots (position_id, snapshot_at DESC);
