import { describe, it, expect } from 'vitest';
import { CLOUD_QUEST_SCENARIO } from '../src/scenarios/cloudQuest';
import { executeScenarioPreview } from '../src/engine/sqlEngine';
import { validateStudentSql } from '../src/engine/sqlValidator';

describe('Phase 1 Gate: SQL Change Review Engine', () => {
  const scenario = CLOUD_QUEST_SCENARIO;

  it('1. Initial pass: Starter query satisfies ticket on initial dataset', async () => {
    // On the initial dataset without previous attendance, updating by student_id
    // only touches registration 104
    const report = await executeScenarioPreview({
      scenario,
      reviewerRows: [],
      sql: scenario.starterSql,
    });

    expect(report.summary.isPass).toBe(true);
    expect(report.summary.totalChanged).toBe(1);
    expect(report.summary.intendedCount).toBe(1);
    expect(report.summary.unintendedCount).toBe(0);
    expect(report.summary.missedCount).toBe(0);
    expect(report.summary.wrongValueCount).toBe(0);
    expect(report.summary.headline).toBe('Passed on starter data');
    expect(report.summary.details).toContain('Meets initial ticket scope');

    const reg104 = report.rows.find((r) => r.registration_id === 104);
    expect(reg104).toBeDefined();
    expect(reg104?.classification).toBe('intended');
    expect(reg104?.before.status).toBe('registered');
    expect(reg104?.after.status).toBe('cancelled');
  });

  it('2. Reviewer exposing two changed rows: Adding October row exposes unintended modification', async () => {
    // Reviewer adds Ananya's October attendance (registration 87, completed)
    const reviewerRows = [scenario.reviewerDefaultPreset];

    // Replay unchanged starter SQL
    const report = await executeScenarioPreview({
      scenario,
      reviewerRows,
      sql: scenario.starterSql,
    });

    expect(report.summary.isPass).toBe(false);
    expect(report.summary.totalChanged).toBe(2);
    expect(report.summary.intendedCount).toBe(1);
    expect(report.summary.unintendedCount).toBe(1);
    expect(report.summary.headline).toBe('2 registrations changed · 1 outside the ticket');

    // Registration 104 is intended
    const reg104 = report.rows.find((r) => r.registration_id === 104);
    expect(reg104?.classification).toBe('intended');
    expect(reg104?.after.status).toBe('cancelled');

    // Registration 87 is unintended: previous attendance wiped out!
    const reg87 = report.rows.find((r) => r.registration_id === 87);
    expect(reg87).toBeDefined();
    expect(reg87?.classification).toBe('unintended');
    expect(reg87?.before.status).toBe('completed');
    expect(reg87?.after.status).toBe('cancelled');
  });

  it('3. Corrected pass: Developer targets registration_id 104, preserving October row', async () => {
    const reviewerRows = [scenario.reviewerDefaultPreset];

    // Developer corrects the SQL
    const report = await executeScenarioPreview({
      scenario,
      reviewerRows,
      sql: scenario.solutionSql,
    });

    expect(report.summary.isPass).toBe(true);
    expect(report.summary.totalChanged).toBe(1);
    expect(report.summary.intendedCount).toBe(1);
    expect(report.summary.unintendedCount).toBe(0);
    expect(report.summary.headline).toBe('Passed on these test cases');
    expect(report.summary.details).toContain('1 registration changed');

    // Row 104 is cancelled (intended)
    const reg104 = report.rows.find((r) => r.registration_id === 104);
    expect(reg104?.classification).toBe('intended');
    expect(reg104?.after.status).toBe('cancelled');

    // Row 87 remains completed (unchanged)
    const reg87 = report.rows.find((r) => r.registration_id === 87);
    expect(reg87?.classification).toBe('unchanged');
    expect(reg87?.after.status).toBe('completed');
  });

  it('4. Update affecting zero rows: Reports missed change and scope failure', async () => {
    const zeroUpdateSql = `UPDATE registrations SET status = 'cancelled' WHERE registration_id = 999;`;

    const report = await executeScenarioPreview({
      scenario,
      reviewerRows: [],
      sql: zeroUpdateSql,
    });

    expect(report.summary.isPass).toBe(false);
    expect(report.summary.totalChanged).toBe(0);
    expect(report.summary.missedCount).toBe(1);
    expect(report.summary.headline).toBe('0 registrations changed · Ticket requirements not met');

    const reg104 = report.rows.find((r) => r.registration_id === 104);
    expect(reg104?.classification).toBe('missed');
    expect(reg104?.after.status).toBe('registered');
  });

  it('5. Wrong value on correct row: Catches invalid status assignment', async () => {
    const wrongValueSql = `UPDATE registrations SET status = 'dropped' WHERE registration_id = 104;`;

    const report = await executeScenarioPreview({
      scenario,
      reviewerRows: [],
      sql: wrongValueSql,
    });

    expect(report.summary.isPass).toBe(false);
    expect(report.summary.totalChanged).toBe(1);
    expect(report.summary.wrongValueCount).toBe(1);
    expect(report.summary.intendedCount).toBe(0);
    expect(report.summary.headline).toBe('1 registration changed with unexpected status');

    const reg104 = report.rows.find((r) => r.registration_id === 104);
    expect(reg104?.classification).toBe('wrong_value');
    expect(reg104?.after.status).toBe('dropped');
  });

  it('6. Syntax error: Gracefully catches syntax errors with understandable message', async () => {
    const brokenSql = `UPDAT registrations SET status = 'cancelled' WHERE registration_id = 104;`;

    await expect(
      executeScenarioPreview({
        scenario,
        reviewerRows: [],
        sql: brokenSql,
      })
    ).rejects.toThrow();
  });

  it('7. Constraint enforcement: Rejects non-UPDATE statements, multiple queries, and invalid columns', () => {
    // Multiple statements
    const multiSql = `UPDATE registrations SET status = 'cancelled' WHERE registration_id = 104; DROP TABLE registrations;`;
    expect(validateStudentSql(multiSql).isValid).toBe(false);
    expect(validateStudentSql(multiSql).error).toContain('Only exactly one SQL statement is permitted');

    // Non-UPDATE statement
    const deleteSql = `DELETE FROM registrations WHERE registration_id = 104;`;
    expect(validateStudentSql(deleteSql).isValid).toBe(false);
    expect(validateStudentSql(deleteSql).error).toContain('Only UPDATE statements are permitted');

    // Modifying forbidden column
    const forbiddenColSql = `UPDATE registrations SET student_id = 'STU-999' WHERE registration_id = 104;`;
    expect(validateStudentSql(forbiddenColSql).isValid).toBe(false);
    expect(validateStudentSql(forbiddenColSql).error).toContain('Only the "status" column is editable');

    // Modifying multiple columns
    const multiColSql = `UPDATE registrations SET status = 'cancelled', event_name = 'Hackathon' WHERE registration_id = 104;`;
    expect(validateStudentSql(multiColSql).isValid).toBe(false);
    expect(validateStudentSql(multiColSql).error).toContain('Only the "status" column is editable');
  });

  describe('Banner UX Regression Checks for Classroom Pilot', () => {
    it('accurately distinguishes all five result banner states', async () => {
      // 1. Starter dataset pass -> "Passed on starter data"
      const starterPass = await executeScenarioPreview({
        scenario,
        reviewerRows: [],
        sql: scenario.starterSql,
      });
      expect(starterPass.summary.isPass).toBe(true);
      expect(starterPass.summary.headline).toBe('Passed on starter data');
      expect(starterPass.summary.totalChanged).toBe(1);

      // 2. Reviewer row triggers regression -> "2 registrations changed · 1 outside the ticket"
      const reviewerRegression = await executeScenarioPreview({
        scenario,
        reviewerRows: [scenario.reviewerDefaultPreset],
        sql: scenario.starterSql,
      });
      expect(reviewerRegression.summary.isPass).toBe(false);
      expect(reviewerRegression.summary.headline).toBe('2 registrations changed · 1 outside the ticket');
      expect(reviewerRegression.summary.totalChanged).toBe(2);
      expect(reviewerRegression.summary.unintendedCount).toBe(1);
      expect(reviewerRegression.summary.details).toContain('#87');
      expect(reviewerRegression.summary.details).toContain('Ananya Sharma');

      // 3. Solution passes with reviewer rows -> "Passed on these test cases"
      const reviewerPass = await executeScenarioPreview({
        scenario,
        reviewerRows: [scenario.reviewerDefaultPreset],
        sql: scenario.solutionSql,
      });
      expect(reviewerPass.summary.isPass).toBe(true);
      expect(reviewerPass.summary.headline).toBe('Passed on these test cases');
      expect(reviewerPass.summary.totalChanged).toBe(1);
      expect(reviewerPass.summary.details).toContain('1 registration changed');

      // 4. Missing target on starter data -> fails with 0 changed
      const missedStarter = await executeScenarioPreview({
        scenario,
        reviewerRows: [],
        sql: `UPDATE registrations SET status = 'cancelled' WHERE student_id = 'STU-NONEXISTENT';`,
      });
      expect(missedStarter.summary.isPass).toBe(false);
      expect(missedStarter.summary.headline).toBe('0 registrations changed · Ticket requirements not met');
      expect(missedStarter.summary.totalChanged).toBe(0);

      // 5. Wrong status on starter data -> fails with wrong status headline
      const wrongStatusStarter = await executeScenarioPreview({
        scenario,
        reviewerRows: [],
        sql: `UPDATE registrations SET status = 'pending' WHERE registration_id = 104;`,
      });
      expect(wrongStatusStarter.summary.isPass).toBe(false);
      expect(wrongStatusStarter.summary.headline).toBe('1 registration changed with unexpected status');
    });
  });
});
