import type { DiffReport, DiffSummary, Registration, RowDiff, Scenario } from '../types';

/**
 * Compares starting state, expected state, and actual state row-by-row based on registration_id.
 * Performs rigorous multi-field verification:
 * 1. Checks all persisted fields (status, student_id, student_name, event_name, session_date).
 * 2. Flags any non-status modification on the target row as an unintended modification.
 * 3. Flags any modification on non-target rows as unintended.
 * 4. Detects deleted, inserted, or unexpected rows.
 * 5. Requires exact expected final state for a passing grade.
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

  // Expected state: only the ticket's target registration should have targetExpectedStatus,
  // and all its other fields must remain untouched. All other rows must be completely unchanged.
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

  // Collect all unique IDs across starting and actual
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
    const before = startingMap.get(id);
    const after = actualMap.get(id);

    const safeBefore: Registration = before || {
      registration_id: id,
      student_id: 'UNKNOWN',
      student_name: 'Unknown',
      event_name: 'Unknown',
      session_date: '',
      status: 'non_existent',
    };

    const safeAfter: Registration = after || {
      registration_id: id,
      student_id: safeBefore.student_id,
      student_name: safeBefore.student_name,
      event_name: safeBefore.event_name,
      session_date: safeBefore.session_date,
      status: 'DELETED',
    };

    const expected: Registration = expectedMap.get(id) || {
      registration_id: id,
      student_id: safeBefore.student_id,
      student_name: safeBefore.student_name,
      event_name: safeBefore.event_name,
      session_date: safeBefore.session_date,
      status: safeBefore.status,
    };

    // Determine changed columns between before and after
    const changedColumns: string[] = [];
    if (!before) {
      changedColumns.push('ROW_INSERTED');
    } else if (!after) {
      changedColumns.push('ROW_DELETED');
    } else {
      if (before.status !== after.status) changedColumns.push('status');
      if (before.student_id !== after.student_id) changedColumns.push('student_id');
      if (before.student_name !== after.student_name) changedColumns.push('student_name');
      if (before.event_name !== after.event_name) changedColumns.push('event_name');
      if (before.session_date !== after.session_date) changedColumns.push('session_date');
    }

    const isChangedFromBefore = changedColumns.length > 0;
    const isTargetRow = id === scenario.targetRegistrationId;

    let classification: RowDiff['classification'];

    if (!before) {
      // Row inserted unexpectedly
      classification = 'unintended';
      unintendedCount++;
      totalChanged++;
    } else if (!after) {
      // Row deleted unexpectedly
      classification = 'unintended';
      unintendedCount++;
      totalChanged++;
    } else if (isTargetRow) {
      // Check if non-status columns were altered on target row
      const nonStatusChanged = changedColumns.filter((c) => c !== 'status');

      if (nonStatusChanged.length > 0) {
        // Target row had non-status columns altered — violation of spec
        classification = 'unintended';
        unintendedCount++;
        totalChanged++;
      } else if (!isChangedFromBefore) {
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
      before: safeBefore,
      after: safeAfter,
      expected,
      classification,
      changedColumns,
    });
  }

  const isPass =
    intendedCount === 1 &&
    unintendedCount === 0 &&
    missedCount === 0 &&
    wrongValueCount === 0 &&
    startingRows.length === actualRows.length;

  // Formulate specific classroom-clear headlines
  let headline = '';
  let details = '';

  const hasReviewerRows = startingRows.length > scenario.initialSeedRows.length;

  if (unintendedCount > 0) {
    headline = `${totalChanged} registrations changed · ${unintendedCount} outside the ticket`;
    const unintendedRows = diffRows.filter((r) => r.classification === 'unintended');
    const affectedList = unintendedRows
      .map(
        (r) =>
          `#${r.registration_id} (${r.before.student_name} · ${r.before.event_name})`
      )
      .join(', ');
    const firstUnintended = unintendedRows[0];
    details = `Warning: Booking ${affectedList} was unintentionally modified from "${firstUnintended?.before.status}" to "${firstUnintended?.after.status}". Scope containment failed.`;
  } else if (missedCount > 0 && totalChanged === 0) {
    headline = '0 registrations changed · Ticket requirements not met';
    details = `Registration #${scenario.targetRegistrationId} was not updated. Check your WHERE clause.`;
  } else if (wrongValueCount > 0) {
    headline = '1 registration changed with unexpected status';
    details = `Registration #${scenario.targetRegistrationId} status was changed to "${actualMap.get(scenario.targetRegistrationId)?.status}", but "${scenario.targetExpectedStatus}" was expected.`;
  } else if (isPass) {
    if (!hasReviewerRows) {
      headline = 'Passed on starter data';
      details = `1 registration changed (#${scenario.targetRegistrationId} → ${scenario.targetExpectedStatus}). Meets initial ticket scope. Test edge cases to verify query resilience.`;
    } else {
      headline = 'Passed on these test cases';
      details = `${totalChanged} registration${totalChanged === 1 ? '' : 's'} changed. Clean execution: Exactly Registration #${scenario.targetRegistrationId} was updated to "${scenario.targetExpectedStatus}". All test cases preserved.`;
    }
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

/**
 * Explains why an unintended row was modified based on the executed SQL,
 * the scenario's target row, and the unintended row's attributes.
 *
 * Rules:
 * 1. Student Scope: If SQL filters by student_id and both target and unintended share student_id.
 *    -> "Both bookings match <Name>'s student ID, so filtering by student ID selected both."
 * 2. Session Scope: If SQL filters by session/event and both share event & time, but different student_id.
 *    -> "<Target>'s #<id> and <Unintended>'s #<id> belong to different students who share the same <Event> event and time. The event-and-time condition matched both."
 * 3. Custom / Uncertain: Direct factual evidence.
 *    -> "<Unintended>'s booking #<id> changed from <before> to <after>. The ticket requested a change only to #<targetId>."
 */
export function explainUnintendedRow(
  unintendedRow: RowDiff,
  targetRow: Registration,
  executedSql: string
): string {
  const sql = executedSql || '';
  const targetSid = targetRow.student_id;
  const rowSid = unintendedRow.before.student_id;
  const targetEvent = targetRow.event_name;
  const rowEvent = unintendedRow.before.event_name;
  const targetDate = targetRow.session_date;
  const rowDate = unintendedRow.before.session_date;

  const hasStudentIdFilter = /\bstudent_id\b/i.test(sql);
  const isSameStudent = Boolean(targetSid && rowSid && targetSid === rowSid);

  if (hasStudentIdFilter && isSameStudent) {
    const studentFirstName = targetRow.student_name.split(' ')[0] || targetRow.student_name;
    return `Both bookings match ${studentFirstName}’s student ID, so filtering by student ID selected both.`;
  }

  const hasSessionFilter = /\bevent_name\b/i.test(sql) || /\bsession_date\b/i.test(sql);
  const isSameSession = targetEvent === rowEvent && targetDate === rowDate;
  const isDifferentStudent = targetSid !== rowSid;

  if (hasSessionFilter && isSameSession && isDifferentStudent) {
    const targetFirstName = targetRow.student_name.split(' ')[0] || targetRow.student_name;
    return `${targetFirstName}’s #${targetRow.registration_id} and ${unintendedRow.before.student_name}’s #${unintendedRow.registration_id} belong to different students who share the same ${targetEvent} event and time. The event-and-time condition matched both.`;
  }

  // Factual evidence comparison fallback for custom SQL, multiple affected rows, and legacy scenarios
  const unintendedFirstName = unintendedRow.before.student_name.split(' ')[0] || unintendedRow.before.student_name;
  return `${unintendedFirstName}’s booking #${unintendedRow.registration_id} changed from ${unintendedRow.before.status} to ${unintendedRow.after.status}. The ticket requested a change only to #${targetRow.registration_id}.`;
}
