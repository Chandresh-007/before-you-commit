import type { Scenario } from '../types';

export const PLACEMENT_DRIVE_SCENARIO_V1_0_0: Scenario = {
  id: 'scenario-placement-drive-rohan',
  version: '1.0.0',
  title: 'Cancel Rohan’s Google Interview Booking',
  subtitle: 'Campus Placement Drive Portal',
  ticketId: 'PLC-204-CANCEL',
  ticketDescription: 'Cancel Rohan Verma’s 10:00 AM Google interview booking. Preserve his other interview rounds and other students in Room 3.',
  targetCriteriaDescription: 'Registration #204 (Rohan Verma, Google Interview, 2024-11-25 10:00) status must transition to "cancelled". Every other interview booking must remain untouched.',
  targetRegistrationId: 204,
  targetExpectedStatus: 'cancelled',
  authoringType: 'hand-authored',
  initialSeedRows: [
    {
      registration_id: 201,
      student_id: 'STU-101',
      student_name: 'Aarav Mehta',
      event_name: 'Microsoft Interview',
      session_date: '2024-11-25 09:00',
      status: 'completed',
    },
    {
      registration_id: 202,
      student_id: 'STU-205',
      student_name: 'Priya Nair',
      event_name: 'Amazon Interview',
      session_date: '2024-11-25 10:00',
      status: 'scheduled',
    },
    {
      registration_id: 203,
      student_id: 'STU-309',
      student_name: 'Sneha Rao',
      event_name: 'Google Interview',
      session_date: '2024-11-25 14:00',
      status: 'scheduled',
    },
    {
      registration_id: 204,
      student_id: 'STU-404',
      student_name: 'Rohan Verma',
      event_name: 'Google Interview',
      session_date: '2024-11-25 10:00',
      status: 'scheduled',
    },
    {
      registration_id: 205,
      student_id: 'STU-512',
      student_name: 'Vikram Das',
      event_name: 'Atlassian Interview',
      session_date: '2024-11-26 11:00',
      status: 'confirmed',
    },
  ],
  exercises: [
    {
      id: 'student-scope',
      name: 'Student Scope (Filter by student_id)',
      description: 'Naive query updates by student_id. Reviewer exposes multi-round interview loss.',
      scopeGuardDescription: 'Rohan’s subsequent interview rounds (such as his afternoon Microsoft session) must NOT be cancelled.',
      starterSql: `-- Initial developer query:
-- Attempting to cancel Rohan's slot by student_id
UPDATE registrations
SET status = 'cancelled'
WHERE student_id = 'STU-404';`,
      solutionSql: `-- Corrected developer query:
-- Target only the specific interview booking primary key (#204)
UPDATE registrations
SET status = 'cancelled'
WHERE registration_id = 204;`,
      reviewerDefaultPreset: {
        registration_id: 188,
        student_id: 'STU-404',
        student_name: 'Rohan Verma',
        event_name: 'Microsoft Interview',
        session_date: '2024-11-25 14:00',
        status: 'scheduled',
      },
      lessonExplanation: `The query filtered WHERE student_id = 'STU-404'. In an interview scheduling system, a candidate can participate in multiple concurrent company rounds. Updating by student_id unconditionally cancels all of the candidate's interviews. Use the candidate primary key registration_id = 204 to isolate the cancellation.`,
    },
    {
      id: 'session-scope',
      name: 'Session Scope (Filter by event & session)',
      description: 'Naive query updates by company and time slot. Reviewer exposes multiple candidates in the same slot.',
      scopeGuardDescription: 'Other candidates scheduled for Google interviews during the 10:00 AM slot must NOT be cancelled.',
      starterSql: `-- Initial developer query:
-- Attempting to cancel by company name and session slot
UPDATE registrations
SET status = 'cancelled'
WHERE event_name = 'Google Interview' AND session_date = '2024-11-25 10:00';`,
      solutionSql: `-- Corrected developer query:
-- Target only the specific interview booking primary key (#204)
UPDATE registrations
SET status = 'cancelled'
WHERE registration_id = 204;`,
      reviewerDefaultPreset: {
        registration_id: 209,
        student_id: 'STU-618',
        student_name: 'Divya Sharma',
        event_name: 'Google Interview',
        session_date: '2024-11-25 10:00',
        status: 'scheduled',
      },
      lessonExplanation: `The query filtered WHERE event_name = 'Google Interview' AND session_date = '2024-11-25 10:00'. Because enterprise interview tracks conduct parallel panels for multiple candidates at the same time, filtering by event and session accidentally cancelled Divya Sharma's panel (#209). Always update single reservations by primary key.`,
    },
  ],
  starterSql: `UPDATE registrations\nSET status = 'cancelled'\nWHERE student_id = 'STU-404';`,
  solutionSql: `UPDATE registrations\nSET status = 'cancelled'\nWHERE registration_id = 204;`,
  reviewerDefaultPreset: {
    registration_id: 188,
    student_id: 'STU-404',
    student_name: 'Rohan Verma',
    event_name: 'Microsoft Interview',
    session_date: '2024-11-25 14:00',
    status: 'scheduled',
  },
};

export const PLACEMENT_DRIVE_SCENARIO: Scenario = {
  ...PLACEMENT_DRIVE_SCENARIO_V1_0_0,
  version: '1.1.0',
  // Factual description based strictly on visible table facts (no hallucinated "Room 3")
  ticketDescription: 'Cancel Rohan Verma’s 10:00 AM Google interview booking on 2024-11-25. Preserve his other interview rounds and other candidates scheduled for interview sessions.',
};
