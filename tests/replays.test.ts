import { describe, it, expect } from 'vitest';
import { resolveScenarioAndExercise } from '../src/scenarios';
import { CLOUD_QUEST_SCENARIO } from '../src/scenarios/cloudQuest';
import { PLACEMENT_DRIVE_SCENARIO, PLACEMENT_DRIVE_SCENARIO_V1_0_0 } from '../src/scenarios/placementDrive';
import type { ReplayRecipe } from '../src/types';

describe('Issue 2: Replay Resolution and Reproducibility Across Scenarios', () => {
  it('1. Resolves legacy recipe missing scenarioId to Cloud Quest 1.0.0', () => {
    // Legacy recipes saved before this release (e.g. 98859cee33a8) only have scenarioVersion: '1.0.0'
    const legacyRecipe: ReplayRecipe = {
      scenarioVersion: '1.0.0',
      reviewerRows: [],
      sql: 'UPDATE registrations SET status = "cancelled" WHERE student_id = "STU-402";',
    };

    const resolved = resolveScenarioAndExercise(legacyRecipe);
    expect(resolved.scenario.id).toBe(CLOUD_QUEST_SCENARIO.id);
    expect(resolved.scenario.title).toBe(CLOUD_QUEST_SCENARIO.title);
    expect(resolved.exercise.id).toBe('default');
  });

  it('2. Preserves historical Placement Drive 1.0.0 and active 1.1.0 without Room 3', () => {
    expect(PLACEMENT_DRIVE_SCENARIO_V1_0_0.version).toBe('1.0.0');
    expect(PLACEMENT_DRIVE_SCENARIO.version).toBe('1.1.0');

    // Historical 1.0.0
    const historicalRecipe: ReplayRecipe = {
      scenarioId: 'scenario-placement-drive-rohan',
      scenarioVersion: '1.0.0',
      exerciseId: 'student-scope',
      reviewerRows: [],
      sql: 'UPDATE registrations SET status = "cancelled" WHERE student_id = "STU-404";',
    };
    const resolvedHist = resolveScenarioAndExercise(historicalRecipe);
    expect(resolvedHist.scenario.version).toBe('1.0.0');

    // Active 1.1.0
    const activeRecipe: ReplayRecipe = {
      scenarioId: 'scenario-placement-drive-rohan',
      scenarioVersion: '1.1.0',
      exerciseId: 'student-scope',
      reviewerRows: [],
      sql: 'UPDATE registrations SET status = "cancelled" WHERE registration_id = 204;',
    };
    const resolvedActive = resolveScenarioAndExercise(activeRecipe);
    expect(resolvedActive.scenario.version).toBe('1.1.0');
    expect(resolvedActive.scenario.ticketDescription).not.toContain('Room 3');
  });

  it('3. Throws understandable error for unknown scenario ID', () => {
    const unknownRecipe: ReplayRecipe = {
      scenarioId: 'scenario-unknown-xyz',
      scenarioVersion: '1.0.0',
      reviewerRows: [],
      sql: 'UPDATE registrations SET status = "cancelled" WHERE registration_id = 1;',
    };

    expect(() => resolveScenarioAndExercise(unknownRecipe)).toThrow(
      /Unknown scenario ID "scenario-unknown-xyz"/
    );
  });

  it('4. Throws understandable error for unsupported scenario version', () => {
    const unsupportedVersionRecipe: ReplayRecipe = {
      scenarioId: 'scenario-cloud-quest-ananya',
      scenarioVersion: '99.0.0',
      reviewerRows: [],
      sql: 'UPDATE registrations SET status = "cancelled" WHERE registration_id = 104;',
    };

    expect(() => resolveScenarioAndExercise(unsupportedVersionRecipe)).toThrow(
      /Unsupported scenario version "99.0.0"/
    );
  });

  it('5. Throws understandable error when scenarioVersion is missing for a scenarioId', () => {
    const missingVersionRecipe = {
      scenarioId: 'scenario-cloud-quest-ananya',
      reviewerRows: [],
      sql: 'UPDATE registrations SET status = "cancelled" WHERE registration_id = 104;',
    } as unknown as ReplayRecipe;

    expect(() => resolveScenarioAndExercise(missingVersionRecipe)).toThrow(
      /missing required "scenarioVersion"/i
    );
  });

  it('6. Rejects explicit unknown exercises instead of silently showing a different exercise', () => {
    const unknownExRecipe: ReplayRecipe = {
      scenarioId: 'scenario-cloud-quest-ananya',
      scenarioVersion: '1.0.0',
      exerciseId: 'non-existent-exercise-id',
      reviewerRows: [],
      sql: 'UPDATE registrations SET status = "cancelled" WHERE registration_id = 104;',
    };

    expect(() => resolveScenarioAndExercise(unknownExRecipe)).toThrow(
      /Unknown exercise "non-existent-exercise-id"/
    );
  });

  it('7. Rejects reviewer rows that collide with scenario seed IDs', () => {
    // Cloud Quest initial seed rows include #104
    const collidingRecipe: ReplayRecipe = {
      scenarioId: 'scenario-cloud-quest-ananya',
      scenarioVersion: '1.0.0',
      reviewerRows: [
        {
          registration_id: 104, // Collides with seed ID 104!
          student_id: 'STU-402',
          student_name: 'Ananya Sharma',
          event_name: 'Cloud Quest',
          session_date: '2024-11-20',
          status: 'registered',
        },
      ],
      sql: 'UPDATE registrations SET status = "cancelled" WHERE registration_id = 104;',
    };

    expect(() => resolveScenarioAndExercise(collidingRecipe)).toThrow(
      /collides with a starter seed record/
    );
  });

  it('8. Rejects duplicate registration_id in reviewer rows', () => {
    const dupRecipe: ReplayRecipe = {
      scenarioId: 'scenario-cloud-quest-ananya',
      scenarioVersion: '1.0.0',
      reviewerRows: [
        {
          registration_id: 88,
          student_id: 'STU-402',
          student_name: 'Ananya Sharma',
          event_name: 'Cloud Quest Oct',
          session_date: '2024-10-15',
          status: 'completed',
        },
        {
          registration_id: 88, // Duplicate!
          student_id: 'STU-402',
          student_name: 'Ananya Sharma',
          event_name: 'Cloud Quest Oct 2',
          session_date: '2024-10-16',
          status: 'completed',
        },
      ],
      sql: 'UPDATE registrations SET status = "cancelled" WHERE registration_id = 104;',
    };

    expect(() => resolveScenarioAndExercise(dupRecipe)).toThrow(
      /Duplicate registration_id #88/
    );
  });

  it('9. Rejects unsafe-integer registration_id in reviewer rows', () => {
    const unsafeRecipe = {
      scenarioId: 'scenario-cloud-quest-ananya',
      scenarioVersion: '1.0.0',
      reviewerRows: [
        {
          registration_id: 104.5, // Non-integer
          student_id: 'STU-402',
          student_name: 'Ananya Sharma',
          event_name: 'Event',
          session_date: '2024-10-15',
          status: 'completed',
        },
      ],
      sql: 'UPDATE registrations SET status = "cancelled" WHERE registration_id = 104;',
    } as unknown as ReplayRecipe;

    expect(() => resolveScenarioAndExercise(unsafeRecipe)).toThrow(
      /invalid registration_id/
    );
  });

  it('10. Resolves multi-version scenario: Aarav v1.0.0 vs approved Aarav v1.1.0', () => {
    // Historical v1.0.0 replay
    const historicalRecipe: ReplayRecipe = {
      scenarioId: 'scenario-bedrock-student-scope-mwrs6sns',
      scenarioVersion: '1.0.0',
      exerciseId: 'student-scope',
      reviewerRows: [],
      sql: 'UPDATE registrations SET status = "cancelled" WHERE student_id = "STU-404";',
    };
    const resolvedHistorical = resolveScenarioAndExercise(historicalRecipe);
    expect(resolvedHistorical.scenario.id).toBe('scenario-bedrock-student-scope-mwrs6sns');
    expect(resolvedHistorical.scenario.version).toBe('1.0.0');

    // Approved v1.1.0 replay (corrected ticket text without "Room 3")
    const approvedRecipe: ReplayRecipe = {
      scenarioId: 'scenario-bedrock-student-scope-mwrs6sns',
      scenarioVersion: '1.1.0',
      exerciseId: 'student-scope',
      reviewerRows: [],
      sql: 'UPDATE registrations SET status = "cancelled" WHERE registration_id = 204;',
    };
    const resolvedApproved = resolveScenarioAndExercise(approvedRecipe);
    expect(resolvedApproved.scenario.id).toBe('scenario-bedrock-student-scope-mwrs6sns');
    expect(resolvedApproved.scenario.version).toBe('1.1.0');
    expect(resolvedApproved.scenario.ticketDescription).not.toContain('Room 3');
    expect(resolvedApproved.scenario.ticketDescription).toContain('Amazon Interview');
  });
});
