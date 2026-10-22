-- WORLDBUILD: Migration 002 - Integrity Enhancements
-- 1. Enforce character lifespan coherence (death_year >= birth_year)

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_character_lifespan'
  ) THEN
    ALTER TABLE characters
    ADD CONSTRAINT chk_character_lifespan
    CHECK (death_year IS NULL OR birth_year IS NULL OR death_year >= birth_year);
  END IF;
END $$;
