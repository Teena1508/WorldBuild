-- WORLDBUILD: Continuity Oracle Extensions Migration (002)
-- Adds fields for intentional exceptions (ignored_reason), actionable resolutions, and resolution timestamps.

ALTER TABLE continuity_findings ADD COLUMN IF NOT EXISTS ignored_reason TEXT;
ALTER TABLE continuity_findings ADD COLUMN IF NOT EXISTS suggested_resolution TEXT;
ALTER TABLE continuity_findings ADD COLUMN IF NOT EXISTS resolved_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_findings_rule_code ON continuity_findings(universe_id, rule_code);
CREATE INDEX IF NOT EXISTS idx_findings_fingerprint ON continuity_findings(universe_id, fingerprint);
