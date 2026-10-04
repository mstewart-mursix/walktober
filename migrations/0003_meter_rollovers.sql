CREATE TABLE IF NOT EXISTS stepometer_entries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  participant_id INTEGER NOT NULL REFERENCES participants(id) ON DELETE CASCADE,
  step_date TEXT NOT NULL,
  cycle_start TEXT NOT NULL,
  reading INTEGER NOT NULL CHECK (reading >= 0 AND reading <= 100000),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  CHECK (step_date >= '2026-10-01' AND step_date <= '2026-10-31'),
  CHECK (cycle_start >= '2026-10-01' AND cycle_start <= '2026-10-31'),
  CHECK (cycle_start <= step_date)
);

INSERT INTO stepometer_entries (participant_id, step_date, cycle_start, reading, created_at, updated_at)
  SELECT participant_id, step_date, cycle_start, reading, updated_at, updated_at
  FROM stepometer_readings
  ORDER BY participant_id, step_date, cycle_start;

CREATE INDEX IF NOT EXISTS stepometer_entries_cycle_idx
  ON stepometer_entries(participant_id, cycle_start, step_date, id);

ALTER TABLE daily_steps RENAME TO daily_steps_before_meter_rollovers;
DROP INDEX IF EXISTS daily_steps_date_idx;

CREATE TABLE daily_steps (
  participant_id INTEGER NOT NULL REFERENCES participants(id) ON DELETE CASCADE,
  step_date TEXT NOT NULL,
  steps INTEGER NOT NULL CHECK (steps >= 0 AND steps <= 1000000),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (participant_id, step_date),
  CHECK (step_date >= '2026-10-01' AND step_date <= '2026-10-31')
);

INSERT INTO daily_steps (participant_id, step_date, steps, updated_at)
  SELECT participant_id, step_date, steps, updated_at FROM daily_steps_before_meter_rollovers;

DROP TABLE daily_steps_before_meter_rollovers;
CREATE INDEX daily_steps_date_idx ON daily_steps(step_date);
