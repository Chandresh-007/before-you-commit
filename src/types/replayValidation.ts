import type { Registration, Scenario } from './index';

export const MAX_REPLAY_PAYLOAD_BYTES = 32 * 1024; // 32 KB
export const MAX_REPLAY_SQL_LENGTH = 4096;
export const MAX_REPLAY_REVIEWER_ROWS = 50;

export interface ValidationFailure {
  valid: false;
  error: string;
}

export interface ValidationSuccess {
  valid: true;
}

export type ReplayValidationResult = ValidationFailure | ValidationSuccess;

/**
 * Validates a single registration row for schema compliance.
 */
export function validateRegistrationRow(row: unknown, index?: number): ReplayValidationResult {
  const prefix = index !== undefined ? `Reviewer row [${index}]` : 'Registration row';

  if (!row || typeof row !== 'object') {
    return { valid: false, error: `${prefix} must be a valid object.` };
  }

  const r = row as Record<string, unknown>;

  // registration_id: positive safe integer
  if (
    typeof r.registration_id !== 'number' ||
    !Number.isSafeInteger(r.registration_id) ||
    r.registration_id <= 0
  ) {
    return {
      valid: false,
      error: `${prefix} has invalid registration_id (${String(r.registration_id)}). Must be a positive integer.`,
    };
  }

  // student_id: string, 1-64 chars
  if (typeof r.student_id !== 'string' || !r.student_id.trim() || r.student_id.length > 64) {
    return {
      valid: false,
      error: `${prefix} has invalid student_id. Must be a non-empty string up to 64 characters.`,
    };
  }

  // student_name: string, 1-100 chars
  if (typeof r.student_name !== 'string' || !r.student_name.trim() || r.student_name.length > 100) {
    return {
      valid: false,
      error: `${prefix} has invalid student_name. Must be a non-empty string up to 100 characters.`,
    };
  }

  // event_name: string, 1-100 chars
  if (typeof r.event_name !== 'string' || !r.event_name.trim() || r.event_name.length > 100) {
    return {
      valid: false,
      error: `${prefix} has invalid event_name. Must be a non-empty string up to 100 characters.`,
    };
  }

  // session_date: string, 1-50 chars
  if (typeof r.session_date !== 'string' || !r.session_date.trim() || r.session_date.length > 50) {
    return {
      valid: false,
      error: `${prefix} has invalid session_date. Must be a non-empty string up to 50 characters.`,
    };
  }

  // status: string, 1-30 chars
  if (typeof r.status !== 'string' || !r.status.trim() || r.status.length > 30) {
    return {
      valid: false,
      error: `${prefix} has invalid status. Must be a non-empty string up to 30 characters.`,
    };
  }

  return { valid: true };
}

/**
 * Validates a replay recipe structure, types, constraints, and limits.
 */
export function validateReplayRecipe(
  recipe: unknown,
  targetScenario?: Scenario
): ReplayValidationResult {
  if (!recipe || typeof recipe !== 'object') {
    return { valid: false, error: 'Replay recipe must be a JSON object.' };
  }

  const r = recipe as Record<string, unknown>;

  // Check SQL
  if (typeof r.sql !== 'string') {
    return { valid: false, error: 'Field "sql" is required and must be a string.' };
  }
  if (!r.sql.trim()) {
    return { valid: false, error: 'Field "sql" cannot be empty.' };
  }
  if (r.sql.length > MAX_REPLAY_SQL_LENGTH) {
    return {
      valid: false,
      error: `SQL string exceeds maximum allowed limit of ${MAX_REPLAY_SQL_LENGTH} characters.`,
    };
  }

  // Check reviewerRows
  if (!Array.isArray(r.reviewerRows)) {
    return { valid: false, error: 'Field "reviewerRows" must be an array.' };
  }
  if (r.reviewerRows.length > MAX_REPLAY_REVIEWER_ROWS) {
    return {
      valid: false,
      error: `Reviewer rows count (${r.reviewerRows.length}) exceeds maximum limit of ${MAX_REPLAY_REVIEWER_ROWS}.`,
    };
  }

  const seenIds = new Set<number>();
  for (let i = 0; i < r.reviewerRows.length; i++) {
    const rowValidation = validateRegistrationRow(r.reviewerRows[i], i);
    if (!rowValidation.valid) {
      return rowValidation;
    }

    const regRow = r.reviewerRows[i] as Registration;
    if (seenIds.has(regRow.registration_id)) {
      return {
        valid: false,
        error: `Duplicate registration_id #${regRow.registration_id} found in reviewer rows. Primary keys must be unique.`,
      };
    }
    seenIds.add(regRow.registration_id);

    // Check collision against scenario seed records if scenario provided
    if (targetScenario) {
      const collidesWithSeed = targetScenario.initialSeedRows.some(
        (seed) => seed.registration_id === regRow.registration_id
      );
      if (collidesWithSeed) {
        return {
          valid: false,
          error: `Reviewer row #${regRow.registration_id} collides with a starter seed record in scenario "${targetScenario.title}". Reviewer records cannot overwrite seed data.`,
        };
      }
    }
  }

  // Scenario ID & Version rules
  if (r.scenarioId !== undefined && r.scenarioId !== null) {
    if (typeof r.scenarioId !== 'string' || !r.scenarioId.trim() || r.scenarioId.length > 64) {
      return {
        valid: false,
        error: 'Field "scenarioId" must be a non-empty string up to 64 characters.',
      };
    }

    if (
      r.scenarioVersion === undefined ||
      r.scenarioVersion === null ||
      typeof r.scenarioVersion !== 'string' ||
      !r.scenarioVersion.trim()
    ) {
      return {
        valid: false,
        error: `Replay recipe for scenario "${r.scenarioId}" is missing required "scenarioVersion".`,
      };
    }

    if (r.scenarioVersion.length > 32) {
      return {
        valid: false,
        error: 'Field "scenarioVersion" exceeds maximum allowed length of 32 characters.',
      };
    }
  } else {
    // Legacy format without scenarioId: must have scenarioVersion '1.0.0'
    if (r.scenarioVersion !== '1.0.0') {
      return {
        valid: false,
        error: `Legacy replay recipe without scenarioId must have scenarioVersion "1.0.0", received "${String(
          r.scenarioVersion
        )}".`,
      };
    }
  }

  // Exercise ID rules
  if (r.exerciseId !== undefined && r.exerciseId !== null) {
    if (typeof r.exerciseId !== 'string' || !r.exerciseId.trim() || r.exerciseId.length > 64) {
      return {
        valid: false,
        error: 'Field "exerciseId" must be a non-empty string up to 64 characters.',
      };
    }
  }

  return { valid: true };
}
