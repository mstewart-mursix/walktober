CREATE TABLE IF NOT EXISTS participants (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL COLLATE NOCASE UNIQUE,
  team TEXT NOT NULL CHECK (team IN ('1:00 PM', '1:15 PM', '1:30 PM', '1:45 PM'))
);

CREATE TABLE IF NOT EXISTS credentials (
  participant_id INTEGER PRIMARY KEY REFERENCES participants(id) ON DELETE CASCADE,
  salt TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  claimed_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS daily_steps (
  participant_id INTEGER NOT NULL REFERENCES participants(id) ON DELETE CASCADE,
  step_date TEXT NOT NULL,
  steps INTEGER NOT NULL CHECK (steps >= 0 AND steps <= 100000),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (participant_id, step_date),
  CHECK (step_date >= '2026-10-01' AND step_date <= '2026-10-31')
);

CREATE TABLE IF NOT EXISTS auth_throttle (
  bucket_key TEXT PRIMARY KEY,
  attempts INTEGER NOT NULL,
  window_started INTEGER NOT NULL,
  blocked_until INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS daily_steps_date_idx ON daily_steps(step_date);
CREATE INDEX IF NOT EXISTS participants_team_idx ON participants(team);

INSERT OR IGNORE INTO participants (name, team) VALUES
  ('Jeremy Roberts', '1:00 PM'),
  ('Genevieve Badders', '1:00 PM'),
  ('Carol Skeel', '1:00 PM'),
  ('James Morgan', '1:00 PM'),
  ('Josh Charnley', '1:00 PM'),
  ('Emily Bailey', '1:00 PM'),
  ('Michael Martin', '1:00 PM'),
  ('Joe Barr', '1:00 PM'),
  ('Isaac Smith', '1:00 PM'),
  ('Brice Hancock', '1:00 PM'),
  ('Tammy Thomas', '1:00 PM'),
  ('Christopher Bryant', '1:00 PM'),
  ('Ashley Cunnington', '1:00 PM'),
  ('Charlotte Davis', '1:15 PM'),
  ('Renee Rooney', '1:15 PM'),
  ('Brookelynn Brown', '1:15 PM'),
  ('Doug Glenn', '1:15 PM'),
  ('Jeff Frost', '1:15 PM'),
  ('Mike Osgood', '1:15 PM'),
  ('Juanita Davis', '1:15 PM'),
  ('Loretta Barley', '1:15 PM'),
  ('Dee Gable', '1:15 PM'),
  ('Chris Hannah', '1:15 PM'),
  ('Brian Troxell', '1:30 PM'),
  ('Kaitlin Parrott', '1:30 PM'),
  ('Mary Harris', '1:30 PM'),
  ('Corey Barker', '1:30 PM'),
  ('Vickie Thomas', '1:30 PM'),
  ('Angie Vannice', '1:30 PM'),
  ('Bret Farmer', '1:30 PM'),
  ('Noah Morgan', '1:30 PM'),
  ('Chris Patton', '1:30 PM'),
  ('Brandon Whiles', '1:30 PM'),
  ('Michelle Wolf', '1:30 PM'),
  ('Peggy Badders', '1:30 PM'),
  ('Tim Williams', '1:30 PM'),
  ('Elijah Evans', '1:45 PM'),
  ('Matthew Stewart', '1:45 PM'),
  ('Anna Hannah', '1:45 PM'),
  ('Colton Guy', '1:45 PM'),
  ('Wendy Wertz', '1:45 PM'),
  ('Kylie Patton', '1:45 PM'),
  ('Bonnie Jones', '1:45 PM'),
  ('Susan Carlock', '1:45 PM'),
  ('Teash Gifford', '1:45 PM'),
  ('Mike Swift', '1:45 PM'),
  ('Shawn Ring', '1:45 PM');
