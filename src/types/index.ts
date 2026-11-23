export type RegistrationStatus = 'registered' | 'completed' | 'waitlist' | 'cancelled' | 'scheduled' | 'confirmed' | string;

export interface Registration {
  registration_id: number;
  reviewerSource?: 'custom' | 'supplied';
  student_id: string;
  student_name: string;
  event_name: string;
  session_date: string;
  status: RegistrationStatus;
}

export type ChangeClassification =
  | 'intended'      // Row was expected to change, and changed to expected value
  | 'unintended'    // Row was NOT expected to change, but was altered
  | 'missed'        // Row was expected to change, but remained unchanged
  | 'wrong_value'   // Row was expected to change, was altered, but ended up with wrong value
  | 'unchanged';    // Row was not expected to change, and did not change

export interface RowDiff {
  registration_id: number;
  before: Registration;
  after: Registration;
  expected: Registration;
  classification: ChangeClassification;
  changedColumns: string[];
}

export interface DiffSummary {
  totalChanged: number;
  intendedCount: number;
  unintendedCount: number;
  missedCount: number;
  wrongValueCount: number;
  unchangedCount: number;
  isPass: boolean;
  headline: string;
  details: string;
}

export interface DiffReport {
  rows: RowDiff[];
  summary: DiffSummary;
  sql: string;
  executionTimeMs: number;
}

export interface ReviewerExercise {
  id: string; // e.g. 'student-scope' | 'session-scope' | 'default'
  name: string;
  description: string;
  scopeGuardDescription: string;
  starterSql: string;
  solutionSql: string;
  reviewerDefaultPreset: Registration;
  lessonExplanation: string;
}

export interface Scenario {
  id: string;
  version: string;
  title: string;
  subtitle: string;
  ticketId: string;
  ticketDescription: string;
  targetCriteriaDescription: string;
  targetRegistrationId: number;
  targetExpectedStatus: string;
  initialSeedRows: Registration[];
  authoringType: 'hand-authored' | 'bedrock-assisted';
  exercises?: ReviewerExercise[];
  // Backwards compatibility for single-exercise scenarios like Cloud Quest:
  reviewerDefaultPreset?: Registration;
  starterSql?: string;
  solutionSql?: string;
  lessonExplanation?: string;
}

export interface ReplayRecipe {
  scenarioId?: string;
  scenarioVersion: string;
  exerciseId?: string;
  reviewerRows: Registration[];
  sql: string;
  createdAt?: string;
  expiresAt?: number;
  id?: string;
}

export interface EngineWorkerRequest {
  id: string;
  sql: string;
  scenario: Scenario;
  reviewerRows: Registration[];
}

export interface EngineWorkerResponse {
  id: string;
  success: boolean;
  report?: DiffReport;
  error?: string;
}
