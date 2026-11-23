import { GENERATED_SCENARIO_SCENARIO_BEDROCK_STUDENT_SCOPE_MWRS6SNS } from './generated/scenario-bedrock-student-scope-mwrs6sns';
import { GENERATED_SCENARIO_SCENARIO_BEDROCK_STUDENT_SCOPE_MWRS6SNS_V1_0_0 } from './generated/scenario-bedrock-student-scope-mwrs6sns-v1-0-0';
import type { ReplayRecipe, ReviewerExercise, Scenario } from '../types';
import { validateReplayRecipe } from '../types/replayValidation';
import { CLOUD_QUEST_SCENARIO } from './cloudQuest';
import { PLACEMENT_DRIVE_SCENARIO, PLACEMENT_DRIVE_SCENARIO_V1_0_0 } from './placementDrive';

export { CLOUD_QUEST_SCENARIO } from './cloudQuest';
export { PLACEMENT_DRIVE_SCENARIO, PLACEMENT_DRIVE_SCENARIO_V1_0_0 } from './placementDrive';

// Active scenarios displayed in the classroom application
export const SCENARIO_BANK: Scenario[] = [
  GENERATED_SCENARIO_SCENARIO_BEDROCK_STUDENT_SCOPE_MWRS6SNS,
  CLOUD_QUEST_SCENARIO,
  PLACEMENT_DRIVE_SCENARIO,
];

// Historical scenario versions preserved for immutable replay reproducibility
export const HISTORICAL_SCENARIOS: Scenario[] = [
  GENERATED_SCENARIO_SCENARIO_BEDROCK_STUDENT_SCOPE_MWRS6SNS_V1_0_0,
  PLACEMENT_DRIVE_SCENARIO_V1_0_0,
];

export const ALL_SCENARIOS: Scenario[] = [
  ...SCENARIO_BANK,
  ...HISTORICAL_SCENARIOS,
];

export function getScenarioById(id: string, version?: string): Scenario | undefined {
  const canonicalId = id === 'placement-drive-v1.1.0' ? 'scenario-placement-drive-rohan' : id;
  if (version) {
    return ALL_SCENARIOS.find((s) => (s.id === canonicalId || s.id === id) && s.version === version);
  }
  // If version omitted, prefer active SCENARIO_BANK version, then any
  return SCENARIO_BANK.find((s) => s.id === canonicalId || s.id === id) || ALL_SCENARIOS.find((s) => s.id === canonicalId || s.id === id);
}

export interface ResolvedReplay {
  scenario: Scenario;
  exercise: ReviewerExercise;
}

/**
 * Resolves a replay recipe to an immutable scenario and specific reviewer exercise.
 * 
 * Rules:
 * 1. Schema & Safety Validation: Rejects malformed recipes, unsafe integer IDs, duplicate IDs,
 *    and seed collisions.
 * 2. Legacy fallback: If scenarioId is missing, recipe must have scenarioVersion '1.0.0'
 *    and falls back strictly to the documented Cloud Quest scenario.
 * 3. Explicit ID and Version: Matches exact version in ALL_SCENARIOS.
 * 4. Explicit errors for unknown scenario ID or unsupported version.
 * 5. Exercise Resolution: Matches exerciseId. If exerciseId is explicitly specified but not found,
 *    it throws an error instead of silently switching to a different exercise.
 */
export function resolveScenarioAndExercise(recipe: ReplayRecipe): ResolvedReplay {
  // 1. Initial schema check (without targetScenario first)
  const preValidation = validateReplayRecipe(recipe);
  if (!preValidation.valid) {
    throw new Error(`Invalid replay recipe: ${preValidation.error}`);
  }

  let targetScenario: Scenario;

  if (!recipe.scenarioId) {
    // Legacy Cloud Quest fallback
    if (recipe.scenarioVersion === '1.0.0') {
      targetScenario = CLOUD_QUEST_SCENARIO;
    } else {
      throw new Error(
        `Invalid legacy replay recipe: scenarioVersion "${recipe.scenarioVersion}" has no associated scenario ID.`
      );
    }
  } else {
    // New / explicit scenario ID: scenarioVersion is required and must not be empty
    if (!recipe.scenarioVersion) {
      throw new Error(
        `Replay recipe for scenario "${recipe.scenarioId}" is missing required scenarioVersion.`
      );
    }

    // Look up with exact version
    const canonicalId =
      recipe.scenarioId === 'placement-drive-v1.1.0'
        ? 'scenario-placement-drive-rohan'
        : recipe.scenarioId;
    const found = getScenarioById(canonicalId, recipe.scenarioVersion);
    if (!found) {
      const anyWithId = ALL_SCENARIOS.find((s) => s.id === canonicalId || s.id === recipe.scenarioId);
      if (!anyWithId) {
        const validIds = SCENARIO_BANK.map((s) => s.id).join(', ');
        throw new Error(
          `Unknown scenario ID "${recipe.scenarioId}". Supported scenarios are: ${validIds}.`
        );
      }
      throw new Error(
        `Unsupported scenario version "${recipe.scenarioVersion}" for scenario "${recipe.scenarioId}". Registered versions are: "${anyWithId.version}".`
      );
    }

    targetScenario = found;
  }

  // 2. Full validation with targetScenario seed collision check
  const fullValidation = validateReplayRecipe(recipe, targetScenario);
  if (!fullValidation.valid) {
    throw new Error(`Replay recipe rejected for scenario "${targetScenario.title}": ${fullValidation.error}`);
  }

  // 3. Resolve exercise
  const exercises = targetScenario.exercises || [];
  let exercise: ReviewerExercise;

  if (recipe.exerciseId) {
    const foundEx = exercises.find((e) => e.id === recipe.exerciseId);
    if (!foundEx) {
      // Must NOT silently show a different exercise!
      const available = exercises.map((e) => e.id).join(', ');
      throw new Error(
        `Unknown exercise "${recipe.exerciseId}" for scenario "${targetScenario.title}". Available exercises: ${available || 'none'}.`
      );
    }
    exercise = foundEx;
  } else {
    // Legacy single-exercise fallback
    exercise = exercises[0] || createDefaultExercise(targetScenario);
  }

  return {
    scenario: targetScenario,
    exercise,
  };
}

function createDefaultExercise(scenario: Scenario): ReviewerExercise {
  return {
    id: 'default',
    name: 'Standard Ticket Scope Review',
    description: scenario.ticketDescription,
    scopeGuardDescription: scenario.targetCriteriaDescription,
    starterSql: scenario.starterSql || '',
    solutionSql: scenario.solutionSql || '',
    reviewerDefaultPreset: scenario.reviewerDefaultPreset || scenario.initialSeedRows[0],
    lessonExplanation: scenario.lessonExplanation || '',
  };
}
