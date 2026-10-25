-- WORLDBUILD: Migration 004 - Multi-User Authentication, Passwords, and Session Management

-- 1. Add password_hash column to app_users and allow session_token to be nullable
ALTER TABLE app_users ADD COLUMN IF NOT EXISTS password_hash TEXT;
ALTER TABLE app_users ALTER COLUMN session_token DROP NOT NULL;

-- 2. Create user_sessions table for genuine multi-user session management
CREATE TABLE IF NOT EXISTS user_sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  session_token TEXT UNIQUE NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  last_used_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_user_sessions_token ON user_sessions(session_token);
CREATE INDEX IF NOT EXISTS idx_user_sessions_user ON user_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_user_sessions_expires ON user_sessions(expires_at);

-- 3. Composite unique constraints for database-level universe integrity
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'uq_universe_id_user') THEN
    ALTER TABLE universes ADD CONSTRAINT uq_universe_id_user UNIQUE (id, user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'uq_character_id_univ') THEN
    ALTER TABLE characters ADD CONSTRAINT uq_character_id_univ UNIQUE (id, universe_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'uq_location_id_univ') THEN
    ALTER TABLE locations ADD CONSTRAINT uq_location_id_univ UNIQUE (id, universe_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'uq_chapter_id_univ') THEN
    ALTER TABLE chapters ADD CONSTRAINT uq_chapter_id_univ UNIQUE (id, universe_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'uq_event_id_univ') THEN
    ALTER TABLE events ADD CONSTRAINT uq_event_id_univ UNIQUE (id, universe_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'uq_secret_id_univ') THEN
    ALTER TABLE secrets ADD CONSTRAINT uq_secret_id_univ UNIQUE (id, universe_id);
  END IF;
END $$;
