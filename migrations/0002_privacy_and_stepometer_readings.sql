ALTER TABLE participants
  ADD COLUMN hide_individual INTEGER NOT NULL DEFAULT 0
  CHECK (hide_individual IN (0, 1));

CREATE TABLE IF NOT EXISTS legacy_step_entries (
  participant_id INTEGER NOT NULL REFERENCES participants(id) ON DELETE CASCADE,
  step_date TEXT NOT NULL,
  steps INTEGER NOT NULL CHECK (steps >= 0 AND steps <= 100000),
  PRIMARY KEY (participant_id, step_date)
);

INSERT OR IGNORE INTO legacy_step_entries (participant_id, step_date, steps)
  SELECT participant_id, step_date, steps FROM daily_steps;

CREATE TABLE IF NOT EXISTS stepometer_readings (
  participant_id INTEGER NOT NULL REFERENCES participants(id) ON DELETE CASCADE,
  step_date TEXT NOT NULL,
  cycle_start TEXT NOT NULL,
  reading INTEGER NOT NULL CHECK (reading >= 0 AND reading <= 100000),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (participant_id, step_date, cycle_start),
  CHECK (step_date >= '2026-10-01' AND step_date <= '2026-10-31'),
  CHECK (cycle_start >= '2026-10-01' AND cycle_start <= '2026-10-31'),
  CHECK (cycle_start <= step_date)
);

CREATE INDEX IF NOT EXISTS stepometer_cycle_idx
  ON stepometer_readings(participant_id, cycle_start, step_date);
