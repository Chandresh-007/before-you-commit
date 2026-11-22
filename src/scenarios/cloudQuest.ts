import type { Scenario } from '../types';

export const CLOUD_QUEST_SCENARIO: Scenario = {
  id: 'scenario-cloud-quest-ananya',
  version: '1.0.0',
  title: 'Cancel Ananya’s November Cloud Quest Registration',
  ticketId: 'REG-104-CANCEL',
  ticketDescription: 'Cancel Ananya’s November Cloud Quest registration. Preserve her previous attendance.',
  targetCriteriaDescription: 'Registration #104 (Ananya Sharma, 2024-11-15 Cloud Quest) must have status updated to "cancelled". All other registrations must remain unaffected.',
  targetRegistrationId: 104,
  targetExpectedStatus: 'cancelled',
  initialSeedRows: [
    {
      registration_id: 101,
      student_id: 'STU-109',
      student_name: 'Bilal Khan',
      event_name: 'Cloud Quest',
      session_date: '2024-11-15',
      status: 'registered',
    },
    {
      registration_id: 102,
      student_id: 'STU-215',
      student_name: 'Chioma Okonjo',
      event_name: 'DevOps Jam',
      session_date: '2024-11-20',
      status: 'waitlist',
    },
    {
      registration_id: 103,
      student_id: 'STU-331',
      student_name: 'Dev Patel',
      event_name: 'Cloud Quest',
      session_date: '2024-11-15',
      status: 'registered',
    },
    {
      registration_id: 104,
      student_id: 'STU-402',
      student_name: 'Ananya Sharma',
      event_name: 'Cloud Quest',
      session_date: '2024-11-15',
      status: 'registered',
    },
    {
      registration_id: 105,
      student_id: 'STU-550',
      student_name: 'Elena Rostova',
      event_name: 'AI Bootcamp',
      session_date: '2024-12-01',
      status: 'confirmed',
    },
  ],
  reviewerDefaultPreset: {
    registration_id: 87,
    student_id: 'STU-402',
    student_name: 'Ananya Sharma',
    event_name: 'Cloud Quest',
    session_date: '2024-10-18',
    status: 'completed',
  },
  starterSql: `-- Initial developer query:
-- Attempting to cancel Ananya's registration by student_id
UPDATE registrations
SET status = 'cancelled'
WHERE student_id = 'STU-402';`,
  solutionSql: `-- Corrected developer query:
-- Target only the November registration (#104) to avoid affecting past attendance
UPDATE registrations
SET status = 'cancelled'
WHERE registration_id = 104;`,
};
