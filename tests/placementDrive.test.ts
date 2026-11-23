import { describe, it, expect } from 'vitest';
import { PLACEMENT_DRIVE_SCENARIO } from '../src/scenarios/placementDrive';
import { executeScenarioPreview } from '../src/engine/sqlEngine';

describe('Issue 1: Placement Drive Exercise in Real SQLite', () => {
  const scenario = PLACEMENT_DRIVE_SCENARIO;

  it('verifies scenario metadata and starter seed conditions', () => {
    expect(scenario.id).toBe('scenario-placement-drive-rohan');
    expect(scenario.version).toBe('1.1.0');
    expect(scenario.ticketDescription).not.toContain('Room 3');
    expect(scenario.targetRegistrationId).toBe(204);
    expect(scenario.targetExpectedStatus).toBe('cancelled');

    // Rohan (#204) must have exactly one booking in starter data
    const rohanBookings = scenario.initialSeedRows.filter((r) => r.student_id === 'STU-404');
    expect(rohanBookings).toHaveLength(1);
    expect(rohanBookings[0].registration_id).toBe(204);

    // Target event + session combination must have exactly one booking in starter data
    const targetSessionBookings = scenario.initialSeedRows.filter(
      (r) => r.event_name === 'Google Interview' && r.session_date === '2024-11-25 10:00'
    );
    expect(targetSessionBookings).toHaveLength(1);
    expect(targetSessionBookings[0].registration_id).toBe(204);

    // Unrelated control records exist
    const controlRows = scenario.initialSeedRows.filter((r) => r.registration_id !== 204);
    expect(controlRows.length).toBeGreaterThanOrEqual(3);

    // Must have two independently selectable exercises
    expect(scenario.exercises).toHaveLength(2);
    expect(scenario.exercises?.map((e) => e.id)).toEqual(['student-scope', 'session-scope']);
  });

  describe('Exercise A: Student Scope (filtering by student_id)', () => {
    const exercise = (scenario.exercises || []).find((e) => e.id === 'student-scope')!;

    it('1. On starter data, starter query changes only #204 from scheduled to cancelled', async () => {
      const report = await executeScenarioPreview({
        scenario,
        reviewerRows: [],
        sql: exercise.starterSql,
      });

      expect(report.summary.isPass).toBe(true);
      expect(report.summary.totalChanged).toBe(1);
      expect(report.summary.intendedCount).toBe(1);
      expect(report.summary.unintendedCount).toBe(0);

      const target = report.rows.find((r) => r.registration_id === 204);
      expect(target).toBeDefined();
      expect(target?.before.status).toBe('scheduled');
      expect(target?.after.status).toBe('cancelled');
      expect(target?.classification).toBe('intended');

      // Assert all control records remain unchanged
      for (const ctrl of scenario.initialSeedRows.filter((r) => r.registration_id !== 204)) {
        const row = report.rows.find((r) => r.registration_id === ctrl.registration_id);
        expect(row?.classification).toBe('unchanged');
        expect(row?.after.status).toBe(ctrl.status);
      }
    });

    it('2. After reviewer adds Rohan to another session, same query changes #204 and that reviewer row (#188)', async () => {
      const reviewerRow = exercise.reviewerDefaultPreset;
      expect(reviewerRow.student_id).toBe('STU-404'); // Rohan's other booking
      expect(reviewerRow.registration_id).toBe(188);

      const report = await executeScenarioPreview({
        scenario,
        reviewerRows: [reviewerRow],
        sql: exercise.starterSql,
      });

      expect(report.summary.isPass).toBe(false);
      expect(report.summary.totalChanged).toBe(2);
      expect(report.summary.intendedCount).toBe(1);
      expect(report.summary.unintendedCount).toBe(1);

      // Target row #204 is intended change
      const target = report.rows.find((r) => r.registration_id === 204);
      expect(target?.classification).toBe('intended');
      expect(target?.after.status).toBe('cancelled');

      // Reviewer row #188 was unintended change
      const rev = report.rows.find((r) => r.registration_id === 188);
      expect(rev).toBeDefined();
      expect(rev?.classification).toBe('unintended');
      expect(rev?.before.status).toBe('scheduled');
      expect(rev?.after.status).toBe('cancelled');
    });

    it('3. Corrected query changes only #204 and preserves every other record including #188', async () => {
      const reviewerRow = exercise.reviewerDefaultPreset;

      const report = await executeScenarioPreview({
        scenario,
        reviewerRows: [reviewerRow],
        sql: exercise.solutionSql,
      });

      expect(report.summary.isPass).toBe(true);
      expect(report.summary.totalChanged).toBe(1);
      expect(report.summary.intendedCount).toBe(1);
      expect(report.summary.unintendedCount).toBe(0);

      // #204 changed
      const target = report.rows.find((r) => r.registration_id === 204);
      expect(target?.classification).toBe('intended');
      expect(target?.after.status).toBe('cancelled');

      // #188 preserved
      const rev = report.rows.find((r) => r.registration_id === 188);
      expect(rev?.classification).toBe('unchanged');
      expect(rev?.after.status).toBe('scheduled');

      // Controls preserved
      for (const ctrl of scenario.initialSeedRows.filter((r) => r.registration_id !== 204)) {
        const row = report.rows.find((r) => r.registration_id === ctrl.registration_id);
        expect(row?.classification).toBe('unchanged');
        expect(row?.after.status).toBe(ctrl.status);
      }
    });
  });

  describe('Exercise B: Session Scope (filtering by event and session)', () => {
    const exercise = (scenario.exercises || []).find((e) => e.id === 'session-scope')!;

    it('1. On starter data, starter query changes only #204 from scheduled to cancelled', async () => {
      const report = await executeScenarioPreview({
        scenario,
        reviewerRows: [],
        sql: exercise.starterSql,
      });

      expect(report.summary.isPass).toBe(true);
      expect(report.summary.totalChanged).toBe(1);
      expect(report.summary.intendedCount).toBe(1);
      expect(report.summary.unintendedCount).toBe(0);

      const target = report.rows.find((r) => r.registration_id === 204);
      expect(target?.classification).toBe('intended');
      expect(target?.after.status).toBe('cancelled');
    });

    it('2. After reviewer adds a different student to the exact event and session (#209), same query changes #204 and #209', async () => {
      const reviewerRow = exercise.reviewerDefaultPreset;
      expect(reviewerRow.registration_id).toBe(209);
      expect(reviewerRow.student_id).not.toBe('STU-404'); // Different student
      expect(reviewerRow.event_name).toBe('Google Interview');
      expect(reviewerRow.session_date).toBe('2024-11-25 10:00'); // Exact event and session

      const report = await executeScenarioPreview({
        scenario,
        reviewerRows: [reviewerRow],
        sql: exercise.starterSql,
      });

      expect(report.summary.isPass).toBe(false);
      expect(report.summary.totalChanged).toBe(2);
      expect(report.summary.intendedCount).toBe(1);
      expect(report.summary.unintendedCount).toBe(1);

      // #204 is intended
      const target = report.rows.find((r) => r.registration_id === 204);
      expect(target?.classification).toBe('intended');
      expect(target?.after.status).toBe('cancelled');

      // #209 is unintended
      const rev = report.rows.find((r) => r.registration_id === 209);
      expect(rev).toBeDefined();
      expect(rev?.classification).toBe('unintended');
      expect(rev?.after.status).toBe('cancelled');
    });

    it('3. Corrected query changes only #204 and preserves every other record including #209', async () => {
      const reviewerRow = exercise.reviewerDefaultPreset;

      const report = await executeScenarioPreview({
        scenario,
        reviewerRows: [reviewerRow],
        sql: exercise.solutionSql,
      });

      expect(report.summary.isPass).toBe(true);
      expect(report.summary.totalChanged).toBe(1);
      expect(report.summary.intendedCount).toBe(1);
      expect(report.summary.unintendedCount).toBe(0);

      // #204 changed
      const target = report.rows.find((r) => r.registration_id === 204);
      expect(target?.classification).toBe('intended');
      expect(target?.after.status).toBe('cancelled');

      // #209 preserved
      const rev = report.rows.find((r) => r.registration_id === 209);
      expect(rev?.classification).toBe('unchanged');
      expect(rev?.after.status).toBe('scheduled');
    });
  });
});
