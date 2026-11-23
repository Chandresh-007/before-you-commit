import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execSync } from 'node:child_process';

const ROOT_DIR = path.resolve(__dirname, '..');
const DRAFTS_DIR = path.resolve(ROOT_DIR, '.drafts');
const TEST_DRAFT_ID = 'scenario-test-disposable-approval';
const TEST_DRAFT_PATH = path.resolve(DRAFTS_DIR, `${TEST_DRAFT_ID}.json`);
const INDEX_PATH = path.resolve(ROOT_DIR, 'src', 'scenarios', 'index.ts');

let originalIndexContent = '';

describe('Blocker 3: Instructor Authoring & Approval Gate Offline Verification', () => {
  const sampleDraft = {
    id: TEST_DRAFT_ID,
    version: '1.0.0',
    title: 'Cancel Test Student Booking',
    subtitle: 'Campus Test',
    ticketId: 'TEST-204-CANCEL',
    ticketDescription: 'Cancel Test Student 10:00 AM booking.',
    targetCriteriaDescription: 'Target #204 must be cancelled.',
    targetRegistrationId: 204,
    targetExpectedStatus: 'cancelled',
    authoringType: 'bedrock-assisted',
    initialSeedRows: [
      {
        registration_id: 201,
        student_id: 'STU-101',
        student_name: 'Aditya Rao',
        event_name: 'Apple Interview',
        session_date: '2024-11-25 09:00',
        status: 'completed',
      },
      {
        registration_id: 204,
        student_id: 'STU-404',
        student_name: 'Test Student',
        event_name: 'Google Interview',
        session_date: '2024-11-25 10:00',
        status: 'scheduled',
      },
    ],
    exercises: [
      {
        id: 'student-scope',
        name: 'Student Scope',
        description: 'Test description',
        scopeGuardDescription: 'Other interviews preserved.',
        starterSql: "UPDATE registrations SET status = 'cancelled' WHERE student_id = 'STU-404';",
        solutionSql: "UPDATE registrations SET status = 'cancelled' WHERE registration_id = 204;",
        reviewerDefaultPreset: {
          registration_id: 188,
          student_id: 'STU-404',
          student_name: 'Test Student',
          event_name: 'Facebook Interview',
          session_date: '2024-11-25 14:00',
          status: 'scheduled',
        },
        lessonExplanation: 'Test lesson explanation.',
      },
    ],
    starterSql: "UPDATE registrations SET status = 'cancelled' WHERE student_id = 'STU-404';",
    solutionSql: "UPDATE registrations SET status = 'cancelled' WHERE registration_id = 204;",
    reviewerDefaultPreset: {
      registration_id: 188,
      student_id: 'STU-404',
      student_name: 'Test Student',
      event_name: 'Facebook Interview',
      session_date: '2024-11-25 14:00',
      status: 'scheduled',
    },
    lessonExplanation: 'Test lesson explanation.',
  };

  beforeEach(() => {
    if (!fs.existsSync(DRAFTS_DIR)) {
      fs.mkdirSync(DRAFTS_DIR, { recursive: true });
    }
    fs.writeFileSync(TEST_DRAFT_PATH, JSON.stringify(sampleDraft, null, 2), 'utf-8');
    originalIndexContent = fs.readFileSync(INDEX_PATH, 'utf-8');
  });

  afterEach(() => {
    if (fs.existsSync(TEST_DRAFT_PATH)) {
      fs.unlinkSync(TEST_DRAFT_PATH);
    }
    const publishedPath = path.resolve(ROOT_DIR, 'src', 'scenarios', 'generated', `${TEST_DRAFT_ID}.ts`);
    if (fs.existsSync(publishedPath)) {
      fs.unlinkSync(publishedPath);
    }
    if (originalIndexContent) {
      fs.writeFileSync(INDEX_PATH, originalIndexContent, 'utf-8');
    }
  });

  it('rejects approval when explicit draft does not exist (never falls back)', () => {
    expect(() => {
      execSync('node scripts/authorChallenge.mjs --approve --draft non-existent-draft-xyz', {
        cwd: ROOT_DIR,
        encoding: 'utf-8',
        stdio: 'pipe',
      });
    }).toThrow(/does not exist/);
  });

  it('rejects approval when expected digest does not match computed SHA-256', () => {
    expect(() => {
      execSync(
        `node scripts/authorChallenge.mjs --approve --draft ${TEST_DRAFT_ID} --digest 0000000000000000000000000000000000000000000000000000000000000000`,
        {
          cwd: ROOT_DIR,
          encoding: 'utf-8',
          stdio: 'pipe',
        }
      );
    }).toThrow(/Draft digest mismatch/);
  });

  it('approves and publishes a valid draft offline with matching digest', () => {
    const raw = fs.readFileSync(TEST_DRAFT_PATH, 'utf-8');
    const digest = crypto.createHash('sha256').update(raw).digest('hex');

    const output = execSync(
      `node scripts/authorChallenge.mjs --approve --draft ${TEST_DRAFT_ID} --digest ${digest}`,
      {
        cwd: ROOT_DIR,
        encoding: 'utf-8',
      }
    );

    expect(output).toContain('SCENARIO SUCCESSFULLY APPROVED AND PUBLISHED');
    expect(output).toContain('NONE (0 network calls; approval executed 100% offline)');
    expect(output).toContain('Local Registration:  SUCCESS');
    expect(output).toContain('Public Deployment:   PENDING');

    const publishedPath = path.resolve(ROOT_DIR, 'src', 'scenarios', 'generated', `${TEST_DRAFT_ID}.ts`);
    expect(fs.existsSync(publishedPath)).toBe(true);

    // Idempotent retry: running approval again with identical content is safe
    const retryOutput = execSync(
      `node scripts/authorChallenge.mjs --approve --draft ${TEST_DRAFT_ID} --digest ${digest}`,
      {
        cwd: ROOT_DIR,
        encoding: 'utf-8',
      }
    );
    expect(retryOutput).toContain('Safe idempotent retry');
  });

  it('recovers from partial-write state when scenario file exists but registry entry is missing', () => {
    const raw = fs.readFileSync(TEST_DRAFT_PATH, 'utf-8');
    const digest = crypto.createHash('sha256').update(raw).digest('hex');

    // Simulate partial-write: generated file exists, but index.ts was never updated
    const targetDir = path.resolve(ROOT_DIR, 'src', 'scenarios', 'generated');
    const publishedPath = path.resolve(targetDir, `${TEST_DRAFT_ID}.ts`);
    const varName = `GENERATED_SCENARIO_${TEST_DRAFT_ID.replace(/[^A-Za-z0-9_]/g, '_').toUpperCase()}`;
    const fileContent = `import type { Scenario } from '../../types';\n\nexport const ${varName}: Scenario = ${JSON.stringify(sampleDraft, null, 2)};\n`;

    fs.writeFileSync(publishedPath, fileContent, 'utf-8');
    // Ensure index.ts does NOT have the scenario
    expect(fs.readFileSync(INDEX_PATH, 'utf-8')).not.toContain(varName);

    // Retry approval
    const output = execSync(
      `node scripts/authorChallenge.mjs --approve --draft ${TEST_DRAFT_ID} --digest ${digest}`,
      {
        cwd: ROOT_DIR,
        encoding: 'utf-8',
      }
    );

    expect(output).toContain('already exists with identical content');
    expect(output).toContain('Registered scenario in SCENARIO_BANK in src/scenarios/index.ts');

    // Check registry: scenario must be present exactly once
    const updatedIndex = fs.readFileSync(INDEX_PATH, 'utf-8');
    expect(updatedIndex).toContain(varName);
    const importMatches = updatedIndex.match(new RegExp(`import { ${varName} }`, 'g')) || [];
    expect(importMatches).toHaveLength(1);
  });

  it('rejects approval when published file already exists with different content (conflict protection)', () => {
    const raw = fs.readFileSync(TEST_DRAFT_PATH, 'utf-8');
    const digest = crypto.createHash('sha256').update(raw).digest('hex');

    // Simulate existing published file with conflicting different content
    const targetDir = path.resolve(ROOT_DIR, 'src', 'scenarios', 'generated');
    const publishedPath = path.resolve(targetDir, `${TEST_DRAFT_ID}.ts`);
    fs.writeFileSync(publishedPath, '// Completely different conflicting content\n', 'utf-8');

    expect(() => {
      execSync(
        `node scripts/authorChallenge.mjs --approve --draft ${TEST_DRAFT_ID} --digest ${digest}`,
        {
          cwd: ROOT_DIR,
          encoding: 'utf-8',
          stdio: 'pipe',
        }
      );
    }).toThrow(/Conflict: Scenario .* is already published with different content/);

    // Original file remains untouched
    expect(fs.readFileSync(publishedPath, 'utf-8')).toBe('// Completely different conflicting content\n');
  });

  it('fails approval when a multi-exercise draft has a failing second exercise', () => {
    const multiDraftId = 'scenario-test-multi-fail';
    const multiDraftPath = path.resolve(DRAFTS_DIR, `${multiDraftId}.json`);
    const multiDraft = {
      ...sampleDraft,
      id: multiDraftId,
      exercises: [
        { ...sampleDraft.exercises[0], id: 'ex-1', name: 'Passing Exercise 1' },
        {
          id: 'ex-2',
          name: 'Failing Exercise 2',
          starterSql: "UPDATE registrations SET status = 'cancelled' WHERE student_id = 'NON-EXISTENT';",
          solutionSql: "UPDATE registrations SET status = 'cancelled' WHERE registration_id = 204;",
          reviewerDefaultPreset: sampleDraft.exercises[0].reviewerDefaultPreset,
          lessonExplanation: 'Fails starter pass.',
        },
      ],
    };

    fs.writeFileSync(multiDraftPath, JSON.stringify(multiDraft, null, 2), 'utf-8');
    const raw = fs.readFileSync(multiDraftPath, 'utf-8');
    const digest = crypto.createHash('sha256').update(raw).digest('hex');

    try {
      expect(() => {
        execSync(
          `node scripts/authorChallenge.mjs --approve --draft ${multiDraftId} --digest ${digest}`,
          {
            cwd: ROOT_DIR,
            encoding: 'utf-8',
            stdio: 'pipe',
          }
        );
      }).toThrow(/Gate Check 1 Failed for "Failing Exercise 2"/);
    } finally {
      if (fs.existsSync(multiDraftPath)) {
        fs.unlinkSync(multiDraftPath);
      }
    }
  });
});
