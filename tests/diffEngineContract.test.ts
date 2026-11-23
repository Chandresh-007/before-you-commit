import { describe, it, expect } from 'vitest';
import { computeDiffReport, explainUnintendedRow } from '../src/engine/diffEngine';
import type { Registration, RowDiff, Scenario } from '../src/types';

describe('Diff Engine Rigorous Verification Contract Tests', () => {
  const dummyScenario: Scenario = {
    id: 'test-scenario',
    version: '1.0.0',
    title: 'Test Scenario',
    subtitle: 'Unit Test',
    ticketId: 'TEST-101',
    ticketDescription: 'Cancel target registration #100',
    targetCriteriaDescription: 'Only registration #100 must be cancelled.',
    targetRegistrationId: 100,
    targetExpectedStatus: 'cancelled',
    authoringType: 'hand-authored',
    initialSeedRows: [
      {
        registration_id: 100,
        student_id: 'STU-100',
        student_name: 'Target Student',
        event_name: 'Tech Talk',
        session_date: '2024-11-25 10:00',
        status: 'scheduled',
      },
      {
        registration_id: 101,
        student_id: 'STU-101',
        student_name: 'Control Student',
        event_name: 'Tech Talk',
        session_date: '2024-11-25 10:00',
        status: 'scheduled',
      },
    ],
  };

  const startingRows: Registration[] = [...dummyScenario.initialSeedRows];

  it('fails grading if a non-status column (student_name) is altered on the target row', () => {
    // Target status changed as expected, but student_name was altered!
    const actualRows: Registration[] = [
      {
        registration_id: 100,
        student_id: 'STU-100',
        student_name: 'Altered Name', // Forbidden alteration!
        event_name: 'Tech Talk',
        session_date: '2024-11-25 10:00',
        status: 'cancelled',
      },
      { ...dummyScenario.initialSeedRows[1] },
    ];

    const report = computeDiffReport(dummyScenario, startingRows, actualRows, 'UPDATE ...', 1);

    expect(report.summary.isPass).toBe(false);
    expect(report.summary.unintendedCount).toBe(1);
    expect(report.summary.intendedCount).toBe(0);

    const targetDiff = report.rows.find((r) => r.registration_id === 100);
    expect(targetDiff?.classification).toBe('unintended');
    expect(targetDiff?.changedColumns).toContain('student_name');
  });

  it('fails grading if student_id or event_name is altered on the target row', () => {
    const actualRows: Registration[] = [
      {
        registration_id: 100,
        student_id: 'STU-999', // Forbidden alteration!
        student_name: 'Target Student',
        event_name: 'Hacked Event', // Forbidden alteration!
        session_date: '2024-11-25 10:00',
        status: 'cancelled',
      },
      { ...dummyScenario.initialSeedRows[1] },
    ];

    const report = computeDiffReport(dummyScenario, startingRows, actualRows, 'UPDATE ...', 1);

    expect(report.summary.isPass).toBe(false);
    expect(report.summary.unintendedCount).toBe(1);
    const targetDiff = report.rows.find((r) => r.registration_id === 100);
    expect(targetDiff?.changedColumns).toContain('student_id');
    expect(targetDiff?.changedColumns).toContain('event_name');
  });

  it('fails grading if an unexpected new row is inserted into the table', () => {
    const actualRows: Registration[] = [
      {
        registration_id: 100,
        student_id: 'STU-100',
        student_name: 'Target Student',
        event_name: 'Tech Talk',
        session_date: '2024-11-25 10:00',
        status: 'cancelled',
      },
      { ...dummyScenario.initialSeedRows[1] },
      {
        registration_id: 999, // Unexpected row!
        student_id: 'STU-999',
        student_name: 'Ghost Student',
        event_name: 'Secret Session',
        session_date: '2024-11-25 12:00',
        status: 'scheduled',
      },
    ];

    const report = computeDiffReport(dummyScenario, startingRows, actualRows, 'UPDATE ...', 1);

    expect(report.summary.isPass).toBe(false);
    expect(report.summary.unintendedCount).toBeGreaterThan(0);
    const ghostDiff = report.rows.find((r) => r.registration_id === 999);
    expect(ghostDiff?.classification).toBe('unintended');
  });

  it('fails grading if a starting row is deleted or missing from the table', () => {
    // Row 101 missing from actual table
    const actualRows: Registration[] = [
      {
        registration_id: 100,
        student_id: 'STU-100',
        student_name: 'Target Student',
        event_name: 'Tech Talk',
        session_date: '2024-11-25 10:00',
        status: 'cancelled',
      },
    ];

    const report = computeDiffReport(dummyScenario, startingRows, actualRows, 'UPDATE ...', 1);

    expect(report.summary.isPass).toBe(false);
    expect(report.summary.unintendedCount).toBeGreaterThan(0);
    const missingDiff = report.rows.find((r) => r.registration_id === 101);
    expect(missingDiff?.classification).toBe('unintended');
  });

  it('passes only when target row status is updated to expected and all other fields and rows are preserved', () => {
    const actualRows: Registration[] = [
      {
        registration_id: 100,
        student_id: 'STU-100',
        student_name: 'Target Student',
        event_name: 'Tech Talk',
        session_date: '2024-11-25 10:00',
        status: 'cancelled', // Correct!
      },
      {
        registration_id: 101,
        student_id: 'STU-101',
        student_name: 'Control Student',
        event_name: 'Tech Talk',
        session_date: '2024-11-25 10:00',
        status: 'scheduled', // Preserved!
      },
    ];

    const report = computeDiffReport(dummyScenario, startingRows, actualRows, 'UPDATE ...', 1);

    expect(report.summary.isPass).toBe(true);
    expect(report.summary.intendedCount).toBe(1);
    expect(report.summary.unintendedCount).toBe(0);
    expect(report.summary.missedCount).toBe(0);
    expect(report.summary.wrongValueCount).toBe(0);
    expect(report.summary.totalChanged).toBe(1);
  });

  describe('Pedagogically Accurate SQL Explanations', () => {
    const aaravTarget: Registration = {
      registration_id: 204,
      student_id: 'STU-404',
      student_name: 'Aarav Patel',
      event_name: 'Amazon Interview',
      session_date: '2024-11-25 10:00',
      status: 'scheduled',
    };

    const aaravFacebookReviewer: RowDiff = {
      registration_id: 188,
      before: {
        registration_id: 188,
        student_id: 'STU-404',
        student_name: 'Aarav Patel',
        event_name: 'Facebook Interview',
        session_date: '2024-11-25 14:00',
        status: 'scheduled',
      },
      after: {
        registration_id: 188,
        student_id: 'STU-404',
        student_name: 'Aarav Patel',
        event_name: 'Facebook Interview',
        session_date: '2024-11-25 14:00',
        status: 'cancelled',
      },
      expected: {
        registration_id: 188,
        student_id: 'STU-404',
        student_name: 'Aarav Patel',
        event_name: 'Facebook Interview',
        session_date: '2024-11-25 14:00',
        status: 'scheduled',
      },
      classification: 'unintended',
      changedColumns: ['status'],
    };

    const rohanTarget: Registration = {
      registration_id: 204,
      student_id: 'STU-102',
      student_name: 'Rohan Verma',
      event_name: 'Google Interview',
      session_date: '2024-11-25 10:00',
      status: 'scheduled',
    };

    const divyaReviewer: RowDiff = {
      registration_id: 209,
      before: {
        registration_id: 209,
        student_id: 'STU-209',
        student_name: 'Divya Sharma',
        event_name: 'Google Interview',
        session_date: '2024-11-25 10:00',
        status: 'scheduled',
      },
      after: {
        registration_id: 209,
        student_id: 'STU-209',
        student_name: 'Divya Sharma',
        event_name: 'Google Interview',
        session_date: '2024-11-25 10:00',
        status: 'cancelled',
      },
      expected: {
        registration_id: 209,
        student_id: 'STU-209',
        student_name: 'Divya Sharma',
        event_name: 'Google Interview',
        session_date: '2024-11-25 10:00',
        status: 'scheduled',
      },
      classification: 'unintended',
      changedColumns: ['status'],
    };

    it('accurately explains student scope when query filters by student_id and both belong to Aarav', () => {
      const sql = "UPDATE registrations SET status = 'cancelled' WHERE student_id = 'STU-404';";
      const explanation = explainUnintendedRow(aaravFacebookReviewer, aaravTarget, sql);

      expect(explanation).toContain('Both bookings match Aarav’s student ID');
      expect(explanation).toContain('filtering by student ID selected both');
    });

    it('accurately explains session scope when Rohan and Divya share event and time, and NEVER claims student-ID', () => {
      const sql = "UPDATE registrations SET status = 'cancelled' WHERE event_name = 'Google Interview' AND session_date = '2024-11-25 10:00';";
      const explanation = explainUnintendedRow(divyaReviewer, rohanTarget, sql);

      expect(explanation).toContain('Rohan’s #204 and Divya Sharma’s #209 belong to different students');
      expect(explanation).toContain('share the same Google Interview event and time');
      expect(explanation).toContain('The event-and-time condition matched both');
      // Must NOT claim same student or student ID!
      expect(explanation.toLowerCase()).not.toContain('both bookings belong to');
      expect(explanation.toLowerCase()).not.toContain('student id');
    });

    it('accurately falls back to direct factual evidence comparison on custom or arbitrary SQL', () => {
      const sql = "UPDATE registrations SET status = 'cancelled' WHERE status = 'scheduled';";
      const explanation = explainUnintendedRow(divyaReviewer, rohanTarget, sql);

      expect(explanation).toBe(
        'Divya’s booking #209 changed from scheduled to cancelled. The ticket requested a change only to #204.'
      );
    });
  });
});
