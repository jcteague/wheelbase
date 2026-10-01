-- [US-101] legs.fees — per-leg commissions and fees, stored as 4-dp TEXT like every money column.
-- Existing rows (every wheel leg) backfill to '0.0000'; the wheel flows never write it.
ALTER TABLE legs ADD COLUMN fees TEXT NOT NULL DEFAULT '0.0000';
