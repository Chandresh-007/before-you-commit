import type { DiffReport, DiffSummary, Registration, RowDiff, Scenario } from '../types';

/**
 * Compares starting state, expected state, and actual state row-by-row based on registration_id.
 * Produces accurate classification: intended, unintended, missed, wrong_value, or unchanged.
 */
export function computeDiffReport(
  scenario: Scenario,
  startingRows: Registration[],
  actualRows: Registration[],
  executedSql: string,
  executionTimeMs: number
): DiffReport {
  // Build lookup maps
  const startingMap = new Map<number, Registration>();
  for (const row of startingRows) {
    startingMap.set(row.registration_id, row);
  }

  const actualMap = new Map<number, Registration>();
  for (const row of actualRows) {
    actualMap.set(row.registration_id, row);
  }

  // Expected state: only the ticket's target registration should have targetExpectedStatus
  const expectedMap = new Map<number, Registration>();
  for (const row of startingRows) {
    if (row.registration_id === scenario.targetRegistrationId) {
      expectedMap.set(row.registration_id, {
        ...row,
        status: scenario.targetExpectedStatus,
      });
    } else {
      expectedMap.set(row.registration_id, { ...row });
    }
  }

  // Collect all unique IDs in starting and actual
  const allIds = Array.from(
    new Set([...Array.from(startingMap.keys()), ...Array.from(actualMap.keys())])
  ).sort((a, b) => a - b);

  const diffRows: RowDiff[] = [];
  let totalChanged = 0;
  let intendedCount = 0;
  let unintendedCount = 0;
  let missedCount = 0;
  let wrongValueCount = 0;
  let unchangedCount = 0;

  for (const id of allIds) {
    const before = startingMap.get(id) || {
      registration_id: id,
      student_id: 'UNKNOWN',
      student_name: 'Unknown',
      event_name: 'Unknown',
      session_date: '',
      status: 'unknown',
    };

    const after = actualMap.get(id) || {
      registration_id: id,
      student_id: before.student_id,
      student_name: before.student_name,
      event_name: before.event_name,
      session_date: before.session_date,
      status: 'DELETED',
    };

    const expected = expectedMap.get(id) || {
      registration_id: id,
      student_id: before.student_id,
      student_name: before.student_name,
      event_name: before.event_name,
      session_date: before.session_date,
      status: before.status,
    };

    // Determine changed columns between before and after
    const changedColumns: string[] = [];
    if (before.status !== after.status) changedColumns.push('status');
    if (before.event_name !== after.event_name) changedColumns.push('event_name');
    if (before.session_date !== after.session_date) changedColumns.push('session_date');
    if (before.student_id !== after.student_id) changedColumns.push('student_id');

    const isChangedFromBefore = changedColumns.length > 0;
    const isTargetRow = id === scenario.targetRegistrationId;

    let classification: RowDiff['classification'];

    if (isTargetRow) {
      if (!isChangedFromBefore) {
        classification = 'missed';
        missedCount++;
      } else if (after.status === scenario.targetExpectedStatus) {
        classification = 'intended';
        intendedCount++;
        totalChanged++;
      } else {
        classification = 'wrong_value';
        wrongValueCount++;
        totalChanged++;
      }
    } else {
      // Non-target row
      if (isChangedFromBefore) {
        classification = 'unintended';
        unintendedCount++;
        totalChanged++;
      } else {
        classification = 'unchanged';
        unchangedCount++;
      }
    }

    diffRows.push({
      registration_id: id,
      before,
      after,
      expected,
      classification,
      changedColumns,
    });
  }

  const isPass =
    intendedCount === 1 &&
    unintendedCount === 0 &&
    missedCount === 0 &&
    wrongValueCount === 0;

  // Formulate specific classroom-clear headlines
  let headline = '';
  let details = '';

  if (unintendedCount > 0) {
    headline = `${totalChanged} registrations changed · ${unintendedCount} outside the ticket`;
    details = `Warning: Row #${diffRows.filter(r => r.classification === 'unintended').map(r => r.registration_id).join(', #')} was unintentionally modified. Scope containment failed.`;
  } else if (missedCount > 0 && totalChanged === 0) {
    headline = '0 registrations changed · Ticket requirements not met';
    details = `Registration #${scenario.targetRegistrationId} was not updated. Check your WHERE clause.`;
  } else if (wrongValueCount > 0) {
    headline = '1 registration changed with unexpected status';
    details = `Registration #${scenario.targetRegistrationId} status was changed to "${actualMap.get(scenario.targetRegistrationId)?.status}", but "${scenario.targetExpectedStatus}" was expected.`;
  } else if (isPass) {
    headline = '1 registration changed · Ticket satisfied';
    details = `Clean execution: Exactly Registration #${scenario.targetRegistrationId} was updated to "${scenario.targetExpectedStatus}". All control and history records remained untouched.`;
  } else {
    headline = `${totalChanged} registrations changed`;
    details = `Result did not match ticket specification.`;
  }

  const summary: DiffSummary = {
    totalChanged,
    intendedCount,
    unintendedCount,
    missedCount,
    wrongValueCount,
    unchangedCount,
    isPass,
    headline,
    details,
  };

  return {
    rows: diffRows,
    summary,
    sql: executedSql,
    executionTimeMs,
  };
}
