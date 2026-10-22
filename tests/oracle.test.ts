import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { query, closeDatabase } from '../src/lib/db';
import { runContinuityScan, ignoreFinding, resolveFinding, reopenFinding, getFindings } from '../src/lib/oracle/engine';
import { generateFindingFingerprint } from '../src/lib/oracle/fingerprint';
import { RULE_CODES } from '../src/lib/oracle/types';

describe('Phase 4: Continuity Oracle Rules Engine & Idempotent Scanning', () => {
  const testUserId = 'user-oracle-tester';
  let universeId: string;

  before(async () => {
    process.env.PG_IN_MEMORY = 'true';

    // Seed test user
    await query(
      `INSERT INTO app_users (id, email, display_name, session_token)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (id) DO NOTHING`,
      [testUserId, 'oracle-test@worldbuild.lore', 'Grand Oracle', 'tok-oracle-test']
    );
  });

  after(async () => {
    await closeDatabase();
  });

  test('Deterministic MD5 Fingerprint generation is stable and order-independent', () => {
    const fp1 = generateFindingFingerprint(RULE_CODES.SPATIAL_OVERLAP, ['char-1', 'evt-2', 'evt-3']);
    const fp2 = generateFindingFingerprint(RULE_CODES.SPATIAL_OVERLAP, ['evt-3', 'char-1', 'evt-2']);
    assert.equal(fp1, fp2, 'Fingerprints should be identical regardless of entity ID ordering');
    assert.equal(typeof fp1, 'string');
    assert.equal(fp1.length, 32, 'MD5 hash should be 32 hex chars');

    const fpDifferentRule = generateFindingFingerprint(RULE_CODES.CYCLIC_DEPENDENCY, ['char-1', 'evt-2', 'evt-3']);
    assert.notEqual(fp1, fpDifferentRule, 'Different rules must produce different fingerprints');
  });

  test('Rule 1: Spatial Overlap detection, exception handling, and auto-resolution', async () => {
    universeId = `univ-rule1-${Date.now()}`;
    await query(
      `INSERT INTO universes (id, user_id, title, description) VALUES ($1, $2, $3, $4)`,
      [universeId, testUserId, 'Spatial Universe', 'Testing spatial overlap']
    );

    // Locations
    await query(`INSERT INTO locations (id, universe_id, name, realm, description) VALUES ($1, $2, $3, $4, $5)`,
      ['loc-1', universeId, 'Citadel of Dawn', 'Solar Plain', 'Sun citadel']);
    await query(`INSERT INTO locations (id, universe_id, name, realm, description) VALUES ($1, $2, $3, $4, $5)`,
      ['loc-2', universeId, 'Abyssal Chasm', 'Underdark', 'Deep void']);

    // Character
    await query(`INSERT INTO characters (id, universe_id, name, bio, status) VALUES ($1, $2, $3, $4, $5)`,
      ['char-astral', universeId, 'Astral Knight Valen', 'Mortal champion', 'alive']);

    // Two events in SAME year at DIFFERENT locations with same character
    await query(
      `INSERT INTO events (id, universe_id, title, timestamp_year, sequence_number, location_id)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      ['evt-s1', universeId, 'Battle of Dawn', 1050, 1, 'loc-1']
    );
    await query(
      `INSERT INTO events (id, universe_id, title, timestamp_year, sequence_number, location_id)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      ['evt-s2', universeId, 'Descent to Abyss', 1050, 2, 'loc-2']
    );

    await query(`INSERT INTO event_participants (id, event_id, character_id) VALUES ($1, $2, $3)`,
      ['part-s1', 'evt-s1', 'char-astral']);
    await query(`INSERT INTO event_participants (id, event_id, character_id) VALUES ($1, $2, $3)`,
      ['part-s2', 'evt-s2', 'char-astral']);

    // 1. Scan -> Should detect spatial overlap
    const scan1 = await runContinuityScan(universeId);
    const spatialFindings = scan1.findings.filter((f) => f.rule_code === RULE_CODES.SPATIAL_OVERLAP);
    assert.equal(spatialFindings.length, 1, 'Should detect 1 spatial overlap finding');
    assert.equal(spatialFindings[0].severity, 'high');
    assert.equal(spatialFindings[0].status, 'open');

    const evidence = JSON.parse(spatialFindings[0].evidence_json);
    assert.equal(evidence.characterId, 'char-astral');
    assert.equal(evidence.timestampYear, 1050);

    // 2. Idempotent repeated scan -> No duplicate findings created
    const scan2 = await runContinuityScan(universeId);
    assert.equal(scan2.findings.filter((f) => f.rule_code === RULE_CODES.SPATIAL_OVERLAP).length, 1);
    assert.equal(scan2.summary.newFindingsCount, 0, 'Repeated scan should create 0 new findings');

    // 3. Narrative Exception: Update character notes to acknowledge astral projection
    await query(
      `UPDATE characters SET death_exception_notes = 'Wields astral projection allowing dual presence' WHERE id = $1`,
      ['char-astral']
    );
    const scanWithException = await runContinuityScan(universeId);
    const resolvedSpatial = scanWithException.findings.find((f) => f.id === spatialFindings[0].id);
    assert.equal(resolvedSpatial?.status, 'resolved', 'Finding should resolve once an intentional supernatural exception is annotated');

    // 4. Negative test: Reset notes and change event year -> should remain resolved
    await query(`UPDATE characters SET death_exception_notes = NULL WHERE id = $1`, ['char-astral']);
    await query(`UPDATE events SET timestamp_year = 1051 WHERE id = $1`, ['evt-s2']);
    const scanSeparated = await runContinuityScan(universeId);
    const finalSpatial = scanSeparated.findings.find((f) => f.id === spatialFindings[0].id);
    assert.equal(finalSpatial?.status, 'resolved', 'Finding remains resolved when event years are separated');
  });

  test('Rule 2: Cyclic Event Dependencies recursive SQL detection and cycle breaking', async () => {
    universeId = `univ-rule2-${Date.now()}`;
    await query(
      `INSERT INTO universes (id, user_id, title, description) VALUES ($1, $2, $3, $4)`,
      [universeId, testUserId, 'Causal Universe', 'Testing dependency cycle recursion']
    );

    // 3 Events: A, B, C
    await query(`INSERT INTO events (id, universe_id, title, timestamp_year, sequence_number) VALUES ($1, $2, $3, $4, $5)`,
      ['evt-c1', universeId, 'Awakening of Fire', 100, 1]);
    await query(`INSERT INTO events (id, universe_id, title, timestamp_year, sequence_number) VALUES ($1, $2, $3, $4, $5)`,
      ['evt-c2', universeId, 'Erection of the Beacon', 110, 2]);
    await query(`INSERT INTO events (id, universe_id, title, timestamp_year, sequence_number) VALUES ($1, $2, $3, $4, $5)`,
      ['evt-c3', universeId, 'Eclipse of the Beacon', 120, 3]);

    // Create Cycle: evt-c1 -> evt-c2 -> evt-c3 -> evt-c1
    await query(`INSERT INTO event_dependencies (id, event_id, predecessor_event_id) VALUES ($1, $2, $3)`,
      ['dep-1', 'evt-c2', 'evt-c1']); // c2 requires c1
    await query(`INSERT INTO event_dependencies (id, event_id, predecessor_event_id) VALUES ($1, $2, $3)`,
      ['dep-2', 'evt-c3', 'evt-c2']); // c3 requires c2
    await query(`INSERT INTO event_dependencies (id, event_id, predecessor_event_id) VALUES ($1, $2, $3)`,
      ['dep-3', 'evt-c1', 'evt-c3']); // c1 requires c3 (CYCLE!)

    const scan = await runContinuityScan(universeId);
    const cycleFindings = scan.findings.filter((f) => f.rule_code === RULE_CODES.CYCLIC_DEPENDENCY);
    assert.equal(cycleFindings.length, 1, 'Should detect exactly 1 canonical cycle finding');
    assert.equal(cycleFindings[0].severity, 'critical');

    const evidence = JSON.parse(cycleFindings[0].evidence_json);
    assert.equal(evidence.cycleMemberIds.length, 3);

    // Break the cycle by deleting dep-3
    await query(`DELETE FROM event_dependencies WHERE id = $1`, ['dep-3']);
    const scanAfterBreak = await runContinuityScan(universeId);
    const resolvedCycle = scanAfterBreak.findings.find((f) => f.id === cycleFindings[0].id);
    assert.equal(resolvedCycle?.status, 'resolved', 'Cycle finding must be marked resolved after edge deletion');
  });

  test('Rule 3: Predecessor Sequence Violations (Chronological & Narrative Inversion)', async () => {
    universeId = `univ-rule3-${Date.now()}`;
    await query(
      `INSERT INTO universes (id, user_id, title, description) VALUES ($1, $2, $3, $4)`,
      [universeId, testUserId, 'Temporal Universe', 'Testing predecessor sequence violations']
    );

    // Event A (Predecessor) at Year 200, Sequence 2
    await query(`INSERT INTO events (id, universe_id, title, timestamp_year, sequence_number) VALUES ($1, $2, $3, $4, $5)`,
      ['evt-p1', universeId, 'Coronation of the Empress', 200, 2]);
    // Event B (Dependent) at Year 150 (Inversion!), Sequence 1 (Inversion!)
    await query(`INSERT INTO events (id, universe_id, title, timestamp_year, sequence_number) VALUES ($1, $2, $3, $4, $5)`,
      ['evt-p2', universeId, 'Rebellion Decree', 150, 1]);

    await query(`INSERT INTO event_dependencies (id, event_id, predecessor_event_id) VALUES ($1, $2, $3)`,
      ['dep-p', 'evt-p2', 'evt-p1']);

    const scan = await runContinuityScan(universeId);
    const predFindings = scan.findings.filter((f) => f.rule_code === RULE_CODES.PREDECESSOR_VIOLATION);
    assert.equal(predFindings.length, 1, 'Should detect predecessor inversion');
    assert.equal(predFindings[0].severity, 'critical');

    // Correct event dates: Dependent event moved to Year 250, Sequence 3
    await query(`UPDATE events SET timestamp_year = 250, sequence_number = 3 WHERE id = $1`, ['evt-p2']);
    const scanCorrected = await runContinuityScan(universeId);
    const resolvedFinding = scanCorrected.findings.find((f) => f.id === predFindings[0].id);
    assert.equal(resolvedFinding?.status, 'resolved', 'Predecessor violation should auto-resolve on correction');
  });

  test('Rule 4: Premature Secret Usage and Missing Knowledge Records', async () => {
    universeId = `univ-rule4-${Date.now()}`;
    await query(
      `INSERT INTO universes (id, user_id, title, description) VALUES ($1, $2, $3, $4)`,
      [universeId, testUserId, 'Secrets Universe', 'Testing epistemic lore validation']
    );

    await query(`INSERT INTO characters (id, universe_id, name, bio) VALUES ($1, $2, $3, $4)`,
      ['char-sage', universeId, 'High Sage Theron', 'Keeper of mysteries']);
    await query(`INSERT INTO secrets (id, universe_id, title, content, severity) VALUES ($1, $2, $3, $4, $5)`,
      ['sec-spell', universeId, 'The Forbidden Glyphs', 'Ancient banishing runes', 'forbidden']);
    await query(`INSERT INTO events (id, universe_id, title, timestamp_year, sequence_number) VALUES ($1, $2, $3, $4, $5)`,
      ['evt-rite', universeId, 'The Banishment Rite', 500, 1]);

    // Sage uses the secret in the rite
    await query(
      `INSERT INTO secret_events (id, event_id, secret_id, character_id, usage_type) VALUES ($1, $2, $3, $4, $5)`,
      ['se-1', 'evt-rite', 'sec-spell', 'char-sage', 'used']
    );

    // 1. Missing Knowledge: Sage has no character_secrets row
    const scan1 = await runContinuityScan(universeId);
    const missingFindings = scan1.findings.filter((f) => f.rule_code === RULE_CODES.PREMATURE_SECRET);
    assert.equal(missingFindings.length, 1, 'Should flag missing knowledge record');
    assert.ok(missingFindings[0].explanation.includes('no recorded knowledge entry'));

    // 2. Add premature knowledge: Sage learned it in Year 550 (after event year 500)
    await query(
      `INSERT INTO character_secrets (id, character_id, secret_id, learned_year) VALUES ($1, $2, $3, $4)`,
      ['cs-1', 'char-sage', 'sec-spell', 550]
    );
    const scan2 = await runContinuityScan(universeId);
    const prematureFindings = scan2.findings.filter((f) => f.rule_code === RULE_CODES.PREMATURE_SECRET && f.status === 'open');
    assert.equal(prematureFindings.length, 1);
    assert.ok(prematureFindings[0].explanation.includes('Year 550'));

    // 3. Correction: Sage learned it in Year 450 (before event year 500)
    await query(`UPDATE character_secrets SET learned_year = 450 WHERE id = $1`, ['cs-1']);
    const scan3 = await runContinuityScan(universeId);
    const openFindings = scan3.findings.filter((f) => f.rule_code === RULE_CODES.PREMATURE_SECRET && f.status === 'open');
    assert.equal(openFindings.length, 0, 'Should have 0 open premature secret findings after correction');
  });

  test('Rule 5: Unannotated Post-Mortem Activity with narrative exceptions', async () => {
    universeId = `univ-rule5-${Date.now()}`;
    await query(
      `INSERT INTO universes (id, user_id, title, description) VALUES ($1, $2, $3, $4)`,
      [universeId, testUserId, 'Mortality Universe', 'Testing post-mortem narrative rules']
    );

    // Character died in year 300, confirmed
    await query(
      `INSERT INTO characters (id, universe_id, name, bio, birth_year, death_year, death_confirmed, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      ['char-ghost', universeId, 'Commander Donald', 'Fallen general', 250, 300, true, 'deceased']
    );

    // Event in year 350 where Donald participates
    await query(
      `INSERT INTO events (id, universe_id, title, timestamp_year, sequence_number) VALUES ($1, $2, $3, $4, $5)`,
      ['evt-afterlife', universeId, 'Siege of the Black Gate', 350, 1]
    );
    await query(
      `INSERT INTO event_participants (id, event_id, character_id, role) VALUES ($1, $2, $3, $4)`,
      ['part-pm1', 'evt-afterlife', 'char-ghost', 'Combatant']
    );

    // 1. Unannotated -> Should flag post-mortem violation
    const scan1 = await runContinuityScan(universeId);
    const pmFindings = scan1.findings.filter((f) => f.rule_code === RULE_CODES.POST_MORTEM_ACTIVITY);
    assert.equal(pmFindings.length, 1, 'Should detect unannotated post-mortem activity');
    assert.equal(pmFindings[0].severity, 'critical');

    // 2. Participant Exception: Annotate role as "Ghostly Apparition"
    await query(`UPDATE event_participants SET role = 'Ghostly Apparition' WHERE id = $1`, ['part-pm1']);
    const scanParticipantException = await runContinuityScan(universeId);
    assert.equal(
      scanParticipantException.findings.find((f) => f.id === pmFindings[0].id)?.status,
      'resolved',
      'Post-mortem finding should resolve when participant role specifies spectral appearance'
    );

    // 3. Reset role and test Character Ascendance Exception
    await query(`UPDATE event_participants SET role = 'Combatant' WHERE id = $1`, ['part-pm1']);
    await query(`UPDATE characters SET status = 'ascended' WHERE id = $1`, ['char-ghost']);
    const scanAscended = await runContinuityScan(universeId);
    assert.equal(
      scanAscended.findings.find((f) => f.id === pmFindings[0].id)?.status,
      'resolved',
      'Post-mortem finding should resolve when character is ascended beyond death'
    );
  });

  test('Intentional Exception Workflow (Ignore with Reason) and UI revalidation', async () => {
    universeId = `univ-workflow-${Date.now()}`;
    await query(
      `INSERT INTO universes (id, user_id, title, description) VALUES ($1, $2, $3, $4)`,
      [universeId, testUserId, 'Workflow Universe', 'Testing ignore-and-revalidate cycle']
    );

    // Create a violation
    await query(`INSERT INTO events (id, universe_id, title, timestamp_year, sequence_number) VALUES ($1, $2, $3, $4, $5)`,
      ['evt-w1', universeId, 'Event Alpha', 100, 1]);
    await query(`INSERT INTO events (id, universe_id, title, timestamp_year, sequence_number) VALUES ($1, $2, $3, $4, $5)`,
      ['evt-w2', universeId, 'Event Beta', 90, 2]);
    await query(`INSERT INTO event_dependencies (id, event_id, predecessor_event_id) VALUES ($1, $2, $3)`,
      ['dep-w', 'evt-w2', 'evt-w1']); // Inversion

    const scan = await runContinuityScan(universeId);
    const finding = scan.findings[0];
    assert.equal(finding.status, 'open');

    // Ignore finding with a deliberate lore reason
    const ignoredReason = 'Time compression due to the Chronos Relic in Chapter 3';
    const ignored = await ignoreFinding(universeId, finding.id, ignoredReason);
    assert.equal(ignored.status, 'ignored');
    assert.equal(ignored.ignored_reason, ignoredReason);

    // Re-scan: the ignored finding must REMAIN ignored and not revert to open
    const rescan = await runContinuityScan(universeId);
    const postScanFinding = rescan.findings.find((f) => f.id === finding.id);
    assert.equal(postScanFinding?.status, 'ignored', 'Ignored finding must stay ignored across rescans');
    assert.equal(postScanFinding?.ignored_reason, ignoredReason);

    // Manual Reopen
    const reopened = await reopenFinding(universeId, finding.id);
    assert.equal(reopened.status, 'open');

    // Manual Resolve
    const resolved = await resolveFinding(universeId, finding.id);
    assert.equal(resolved.status, 'resolved');

    // Query through getFindings helper with status filter
    const resolvedList = await getFindings(universeId, 'resolved');
    assert.equal(resolvedList.length, 1);
    assert.equal(resolvedList[0].id, finding.id);
  });
});

