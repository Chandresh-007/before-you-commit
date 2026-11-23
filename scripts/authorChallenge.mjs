#!/usr/bin/env node

/**
 * Before You Commit — Bedrock-Assisted Instructor Authoring Tool
 * 
 * Uses Amazon Bedrock to draft domain entities (names, company panels, dates, reviewer hints)
 * while trusting application template logic for IDs, relationships, starter queries,
 * and expected diffs.
 * 
 * Preview saves the reviewed draft locally.
 * Approval consumes that exact saved draft without contacting Bedrock.
 * 
 * Runs the deterministic in-memory SQLite Playability Gate before publishing.
 */

import { BedrockRuntimeClient, ConverseCommand } from '@aws-sdk/client-bedrock-runtime';
import initSqlJs from 'sql.js';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');
const DRAFTS_DIR = path.resolve(ROOT_DIR, '.drafts');

// Default Configuration
const DEFAULT_REGION = process.env.AWS_REGION || 'ap-south-1';
const DEFAULT_MODEL = 'apac.amazon.nova-micro-v1:0';

// Parse CLI Arguments
const args = process.argv.slice(2);
function getArg(flag, defaultValue = null) {
  const idx = args.indexOf(flag);
  return idx !== -1 && args[idx + 1] ? args[idx + 1] : defaultValue;
}
const hasFlag = (flag) => args.includes(flag);

const exerciseType = getArg('--exercise', 'student-scope'); // 'student-scope' | 'session-scope'
const campusSetting = getArg('--setting', 'Campus Tech Placement Drive 2024');
const modelId = getArg('--model', DEFAULT_MODEL);
const customId = getArg('--id', null);
const customVersion = getArg('--version', null);
const draftArg = getArg('--draft', null);
const expectedDigest = getArg('--digest', null);
const isApprove = hasFlag('--approve');

function escapeSqlLiteral(str) {
  return String(str).replace(/'/g, "''");
}

console.log('='.repeat(70));
console.log('  BEFORE YOU COMMIT — INSTRUCTOR AUTHORING TOOL');
console.log('='.repeat(70));
console.log(`Setting:       ${campusSetting}`);
console.log(`Exercise:      ${exerciseType}`);
console.log(`AWS Region:    ${DEFAULT_REGION}`);
console.log(`Bedrock Model: ${modelId}`);
console.log(`Mode:          ${isApprove ? 'APPROVE & PUBLISH' : 'PREVIEW & DRAFT'}`);
if (draftArg) {
  console.log(`Draft Source:  ${draftArg}`);
}
if (expectedDigest) {
  console.log(`Expected SHA:  ${expectedDigest}`);
}
console.log('-'.repeat(70));

// Step 1: Query Amazon Bedrock (Only during fresh preview without existing draft)
async function generateCreativeDraft() {
  console.log('\n[1/4] Querying Amazon Bedrock for creative domain narrative...');
  const client = new BedrockRuntimeClient({ region: DEFAULT_REGION });

  const prompt = `You are an educational assistant for a college DBMS course.
Create realistic, authentic Indian student names and tech company placement interview panels for a database challenge.
Campus context: "${campusSetting}".

IMPORTANT SCHEMA RULES:
The SQLite database table is strictly:
registrations(registration_id INTEGER PRIMARY KEY, student_id TEXT, student_name TEXT, event_name TEXT, session_date TEXT, status TEXT)
Do NOT mention or invent non-existent database attributes like room numbers, hall names, seat numbers, or departments.
All facts in tickets and hints must be verifiable directly against these six columns.

Return ONLY valid JSON with this exact schema (no markdown, no backticks, no extra text):
{
  "targetStudentName": "string (e.g. Aarav Patel)",
  "targetCompany": "string (e.g. Amazon Interview)",
  "secondaryCompany": "string (e.g. Facebook Interview)",
  "reviewerStudentName": "string (e.g. Divya Sharma)",
  "controlStudents": ["string", "string", "string"],
  "controlCompanies": ["string", "string", "string"],
  "reviewerHint": "string (brief 1-sentence hint why updating without primary key causes unintended modification)"
}`;

  const startTime = Date.now();
  const command = new ConverseCommand({
    modelId,
    messages: [
      {
        role: 'user',
        content: [{ text: prompt }],
      },
    ],
    inferenceConfig: {
      temperature: 0.7,
      maxTokens: 500,
    },
  });

  const response = await client.send(command);
  const latency = Date.now() - startTime;
  const rawText = response.output.message.content[0].text.trim();

  // Strip code fences if model included them
  const cleaned = rawText.replace(/^```json/i, '').replace(/^```/i, '').replace(/```$/i, '').trim();
  const parsed = JSON.parse(cleaned);

  validateCreativeDraftSchema(parsed);

  console.log(`✓ Bedrock response received in ${latency}ms.`);
  return parsed;
}

function validateCreativeDraftSchema(creative) {
  if (!creative || typeof creative !== 'object') {
    throw new Error('Bedrock returned invalid JSON: expected root object.');
  }
  const requiredFields = [
    'targetStudentName',
    'targetCompany',
    'secondaryCompany',
    'reviewerStudentName',
    'controlStudents',
    'controlCompanies',
  ];
  for (const f of requiredFields) {
    if (!creative[f]) {
      throw new Error(`Bedrock draft missing required field: "${f}".`);
    }
  }
  if (!Array.isArray(creative.controlStudents) || creative.controlStudents.length < 3) {
    throw new Error('Bedrock draft "controlStudents" must be an array with at least 3 names.');
  }
  if (!Array.isArray(creative.controlCompanies) || creative.controlCompanies.length < 3) {
    throw new Error('Bedrock draft "controlCompanies" must be an array with at least 3 company names.');
  }
}

// Step 2: Deterministic Template Assembly
function assembleScenario(creative, exercise, overrides = {}) {
  console.log('\n[2/4] Assembling challenge with trusted relational template logic...');

  const targetRegId = 204;
  const targetStudentId = 'STU-404';
  const targetSessionDate = '2024-11-25 10:00';

  const initialSeedRows = [
    {
      registration_id: 201,
      student_id: 'STU-101',
      student_name: creative.controlStudents[0] || 'Aditya Rao',
      event_name: creative.controlCompanies[0] || 'Apple Interview',
      session_date: '2024-11-25 09:00',
      status: 'completed',
    },
    {
      registration_id: 202,
      student_id: 'STU-205',
      student_name: creative.controlStudents[1] || 'Sia Mishra',
      event_name: creative.controlCompanies[1] || 'Netflix Interview',
      session_date: '2024-11-25 10:00',
      status: 'scheduled',
    },
    {
      registration_id: 203,
      student_id: 'STU-309',
      student_name: creative.controlStudents[2] || 'Ishan Gupta',
      event_name: creative.targetCompany,
      session_date: '2024-11-25 14:00',
      status: 'scheduled',
    },
    {
      registration_id: targetRegId,
      student_id: targetStudentId,
      student_name: creative.targetStudentName,
      event_name: creative.targetCompany,
      session_date: targetSessionDate,
      status: 'scheduled',
    },
    {
      registration_id: 205,
      student_id: 'STU-512',
      student_name: 'Vikram Das',
      event_name: creative.controlCompanies[2] || 'Twitter Interview',
      session_date: '2024-11-26 11:00',
      status: 'confirmed',
    },
  ];

  let reviewerPreset;
  let starterSql;
  let scopeGuard;
  let lessonExplanation;
  let ticketDescription;

  const safeTargetCompany = escapeSqlLiteral(creative.targetCompany);
  const safeTargetStudentId = escapeSqlLiteral(targetStudentId);
  const safeTargetSessionDate = escapeSqlLiteral(targetSessionDate);

  if (exercise === 'student-scope') {
    reviewerPreset = {
      registration_id: 188,
      student_id: targetStudentId,
      student_name: creative.targetStudentName,
      event_name: creative.secondaryCompany || 'Facebook Interview',
      session_date: '2024-11-25 14:00',
      status: 'scheduled',
    };
    starterSql = `UPDATE registrations\nSET status = 'cancelled'\nWHERE student_id = '${safeTargetStudentId}';`;
    scopeGuard = `${creative.targetStudentName}’s other interview rounds (such as the ${reviewerPreset.event_name} session) must NOT be cancelled.`;
    lessonExplanation = `The query filtered WHERE student_id = '${targetStudentId}'. In an interview scheduling system, a candidate can participate in multiple concurrent company rounds. Updating by student_id unconditionally cancels all of the candidate's interviews. Use registration_id = ${targetRegId} to isolate the cancellation.`;
    ticketDescription = `Cancel ${creative.targetStudentName}’s 10:00 AM ${creative.targetCompany} booking on 2024-11-25. Preserve their other interview rounds and other students' scheduled sessions.`;
  } else {
    // session-scope
    reviewerPreset = {
      registration_id: 209,
      student_id: 'STU-618',
      student_name: creative.reviewerStudentName || 'Divya Sharma',
      event_name: creative.targetCompany,
      session_date: targetSessionDate,
      status: 'scheduled',
    };
    starterSql = `UPDATE registrations\nSET status = 'cancelled'\nWHERE event_name = '${safeTargetCompany}' AND session_date = '${safeTargetSessionDate}';`;
    scopeGuard = `Other candidates scheduled for ${creative.targetCompany} during the ${targetSessionDate} slot must NOT be cancelled.`;
    lessonExplanation = `The query filtered WHERE event_name = '${safeTargetCompany}' AND session_date = '${safeTargetSessionDate}'. Because interview panels run parallel candidate slots at the same time, this query accidentally wiped ${reviewerPreset.student_name}'s panel (#${reviewerPreset.registration_id}). Target candidate primary key registration_id = ${targetRegId}.`;
    ticketDescription = `Cancel the ${creative.targetCompany} 10:00 AM booking for ${creative.targetStudentName} on 2024-11-25. Preserve other candidates scheduled for the same panel.`;
  }

  const solutionSql = `UPDATE registrations\nSET status = 'cancelled'\nWHERE registration_id = ${targetRegId};`;

  const scenarioId = overrides.id || `scenario-bedrock-${exercise}-${Date.now().toString(36)}`;
  const scenarioVersion = overrides.version || '1.0.0';

  const scenario = {
    id: scenarioId,
    version: scenarioVersion,
    title: `Cancel ${creative.targetStudentName}’s ${creative.targetCompany} Booking`,
    subtitle: campusSetting,
    ticketId: `PLC-${targetRegId}-CANCEL`,
    ticketDescription,
    targetCriteriaDescription: `Registration #${targetRegId} (${creative.targetStudentName}, ${creative.targetCompany}, ${targetSessionDate}) status must transition to "cancelled". Every other interview booking must remain untouched.`,
    targetRegistrationId: targetRegId,
    targetExpectedStatus: 'cancelled',
    authoringType: 'bedrock-assisted',
    initialSeedRows,
    exercises: [
      {
        id: exercise,
        name: exercise === 'student-scope' ? 'Student Scope (Filter by student_id)' : 'Session Scope (Filter by event & session)',
        description: `Bedrock-assisted generated challenge testing scope containment in ${campusSetting}.`,
        scopeGuardDescription: scopeGuard,
        starterSql,
        solutionSql,
        reviewerDefaultPreset: reviewerPreset,
        lessonExplanation,
      },
    ],
    starterSql,
    solutionSql,
    reviewerDefaultPreset: reviewerPreset,
    lessonExplanation,
  };

  return scenario;
}

// Step 3: Run SQLite Playability Acceptance Gate
async function runPlayabilityGate(scenario) {
  console.log('\n[3/4] Running in-memory SQLite Playability Gate...');
  const wasmPath = path.resolve(ROOT_DIR, 'public', 'sql-wasm.wasm');
  const wasmBinary = fs.readFileSync(wasmPath);
  const SQL = await initSqlJs({ wasmBinary });

  function executeRun(startingRows, sql) {
    const db = new SQL.Database();
    db.run(`
      CREATE TABLE registrations (
        registration_id INTEGER PRIMARY KEY,
        student_id TEXT NOT NULL,
        student_name TEXT NOT NULL,
        event_name TEXT NOT NULL,
        session_date TEXT NOT NULL,
        status TEXT NOT NULL
      );
    `);

    const insertStmt = db.prepare(`
      INSERT INTO registrations (registration_id, student_id, student_name, event_name, session_date, status)
      VALUES (?, ?, ?, ?, ?, ?);
    `);
    for (const r of startingRows) {
      insertStmt.run([r.registration_id, r.student_id, r.student_name, r.event_name, r.session_date, r.status]);
    }
    insertStmt.free();

    db.run(sql);

    const queryRes = db.exec(`SELECT registration_id, student_id, student_name, event_name, session_date, status FROM registrations ORDER BY registration_id ASC;`);
    db.close();

    const actualMap = new Map();
    if (queryRes.length > 0 && queryRes[0].values) {
      for (const [id, sid, sname, ev, dt, st] of queryRes[0].values) {
        actualMap.set(Number(id), {
          registration_id: Number(id),
          student_id: String(sid),
          student_name: String(sname),
          event_name: String(ev),
          session_date: String(dt),
          status: String(st),
        });
      }
    }
    return actualMap;
  }

  const exercisesToValidate = scenario.exercises && scenario.exercises.length > 0
    ? scenario.exercises
    : [{
        id: 'default',
        name: 'Default Exercise',
        starterSql: scenario.starterSql,
        solutionSql: scenario.solutionSql,
        reviewerDefaultPreset: scenario.reviewerDefaultPreset,
      }];
  const targetId = scenario.targetRegistrationId;
  const expectedStatus = scenario.targetExpectedStatus || 'cancelled';

  for (let i = 0; i < exercisesToValidate.length; i++) {
    const ex = exercisesToValidate[i];
    const exName = ex.name || ex.id || `Exercise ${i + 1}`;
    console.log(`\n  Validating exercise [${i + 1}/${exercisesToValidate.length}]: "${exName}"...`);

    const revPreset = ex.reviewerDefaultPreset || scenario.reviewerDefaultPreset;
    if (!revPreset) {
      throw new Error(`Gate Error: Exercise "${exName}" lacks reviewerDefaultPreset.`);
    }
    const revId = revPreset.registration_id;

    // Check 1: Starter query on seed data changes only targetId to expectedStatus
    const seedActual = executeRun(scenario.initialSeedRows, ex.starterSql);
    const seedTarget = seedActual.get(targetId);
    if (!seedTarget || seedTarget.status !== expectedStatus) {
      throw new Error(
        `Gate Check 1 Failed for "${exName}": Target #${targetId} status was not "${expectedStatus}" (got "${seedTarget?.status}").`
      );
    }
    for (const row of scenario.initialSeedRows) {
      const actual = seedActual.get(row.registration_id);
      if (!actual) throw new Error(`Gate Check 1 Failed for "${exName}": Seed row #${row.registration_id} was deleted.`);
      if (row.registration_id !== targetId) {
        if (
          actual.status !== row.status ||
          actual.student_name !== row.student_name ||
          actual.student_id !== row.student_id ||
          actual.event_name !== row.event_name ||
          actual.session_date !== row.session_date
        ) {
          throw new Error(`Gate Check 1 Failed for "${exName}": Control row #${row.registration_id} was modified on seed data.`);
        }
      }
    }
    console.log(`  ✓ Check 1 (Seed Pass) for "${exName}": Starter query modifies exactly target row #${targetId}.`);

    // Check 2: Starter query on seed + reviewer row modifies both targetId and reviewer row
    const combinedRows = [...scenario.initialSeedRows, revPreset];
    const trapActual = executeRun(combinedRows, ex.starterSql);
    const revRow = trapActual.get(revId);
    if (!revRow || revRow.status !== expectedStatus) {
      throw new Error(`Gate Check 2 Failed for "${exName}": Reviewer row #${revId} was NOT modified by starter query. Trap failed!`);
    }
    const trapTarget = trapActual.get(targetId);
    if (!trapTarget || trapTarget.status !== expectedStatus) {
      throw new Error(`Gate Check 2 Failed for "${exName}": Target row #${targetId} was not modified.`);
    }
    console.log(`  ✓ Check 2 (Reviewer Trap) for "${exName}": Reviewer row #${revId} is caught in unintended modification.`);

    // Check 3: Solution query on seed + reviewer row changes ONLY targetId and preserves reviewer row and all fields
    const solutionActual = executeRun(combinedRows, ex.solutionSql);
    const solTarget = solutionActual.get(targetId);
    if (!solTarget || solTarget.status !== expectedStatus) {
      throw new Error(`Gate Check 3 Failed for "${exName}": Solution query did not change target row #${targetId} to "${expectedStatus}".`);
    }
    const solRev = solutionActual.get(revId);
    if (
      !solRev ||
      solRev.status !== revPreset.status ||
      solRev.student_name !== revPreset.student_name ||
      solRev.student_id !== revPreset.student_id ||
      solRev.event_name !== revPreset.event_name ||
      solRev.session_date !== revPreset.session_date
    ) {
      throw new Error(`Gate Check 3 Failed for "${exName}": Solution query modified reviewer row #${revId}!`);
    }
    for (const row of scenario.initialSeedRows) {
      const actual = solutionActual.get(row.registration_id);
      if (!actual) throw new Error(`Gate Check 3 Failed for "${exName}": Control row #${row.registration_id} was deleted.`);
      if (row.registration_id !== targetId) {
        if (
          actual.status !== row.status ||
          actual.student_name !== row.student_name ||
          actual.student_id !== row.student_id ||
          actual.event_name !== row.event_name ||
          actual.session_date !== row.session_date
        ) {
          throw new Error(`Gate Check 3 Failed for "${exName}": Solution query modified control row #${row.registration_id}!`);
        }
      }
    }
    console.log(`  ✓ Check 3 (Solution Pass) for "${exName}": Solution query cancels #${targetId} and preserves row #${revId} and all controls.`);
  }
  console.log('✓ In-Memory SQLite Playability Gate PASSED for all exercises.');
}

// Step 4: Save draft to local disk
function saveDraft(scenario) {
  if (!fs.existsSync(DRAFTS_DIR)) {
    fs.mkdirSync(DRAFTS_DIR, { recursive: true });
  }

  const draftFilename = `${scenario.id}.json`;
  const draftPath = path.resolve(DRAFTS_DIR, draftFilename);
  const jsonContent = JSON.stringify(scenario, null, 2);
  fs.writeFileSync(draftPath, jsonContent, 'utf-8');

  const sha256 = crypto.createHash('sha256').update(jsonContent).digest('hex');
  console.log(`\n💾 Saved reviewed draft to disk: ${draftPath}`);
  console.log(`   Draft SHA-256: ${sha256}`);
  return { draftPath, sha256 };
}

// Step 5: Load draft from disk (Local only — zero Bedrock access required)
function loadDraft(targetArg) {
  console.log(`\n[Local Draft Loader] Resolving draft for "${targetArg}"...`);

  if (!targetArg) {
    throw new Error(
      'Approval requires an explicit draft identifier or path via --draft <id-or-path>.'
    );
  }

  let resolvedPath = null;
  if (fs.existsSync(targetArg)) {
    resolvedPath = path.resolve(targetArg);
  } else if (fs.existsSync(path.resolve(DRAFTS_DIR, `${targetArg}.json`))) {
    resolvedPath = path.resolve(DRAFTS_DIR, `${targetArg}.json`);
  } else if (fs.existsSync(path.resolve(DRAFTS_DIR, targetArg))) {
    resolvedPath = path.resolve(DRAFTS_DIR, targetArg);
  } else {
    // Explicit target requested but not found: FAIL IMMEDIATELY.
    throw new Error(
      `Draft "${targetArg}" does not exist. Approval will NOT fall back to another draft.`
    );
  }

  const raw = fs.readFileSync(resolvedPath, 'utf-8');
  let scenario;
  try {
    scenario = JSON.parse(raw);
  } catch (err) {
    throw new Error(`Draft file at "${resolvedPath}" contains invalid JSON: ${err.message}`);
  }

  const sha256 = crypto.createHash('sha256').update(raw).digest('hex');
  console.log(`✓ Loaded draft: ${resolvedPath}`);
  console.log(`  Draft SHA-256: ${sha256}`);

  if (expectedDigest && expectedDigest !== sha256) {
    throw new Error(
      `Draft digest mismatch! Expected digest "${expectedDigest}" but computed "${sha256}". Approval aborted.`
    );
  }

  return { scenario, draftPath: resolvedPath, sha256 };
}

// Step 6: Publish approved scenario immutably to scenario bank
function publishScenario(scenario) {
  console.log('\n[4/4] Publishing approved scenario immutably to scenario bank...');
  const targetDir = path.resolve(ROOT_DIR, 'src', 'scenarios', 'generated');
  if (!fs.existsSync(targetDir)) {
    fs.mkdirSync(targetDir, { recursive: true });
  }

  const filename = `${scenario.id}.ts`;
  const filePath = path.resolve(targetDir, filename);
  const stagingPath = path.resolve(targetDir, `.staging_${scenario.id}.tmp`);

  const serializedScenario = JSON.stringify(scenario, null, 2);
  const fileContent = `import type { Scenario } from '../../types';

export const GENERATED_SCENARIO_${scenario.id.replace(/[^A-Za-z0-9_]/g, '_').toUpperCase()}: Scenario = ${serializedScenario};
`;

  // Check if file already exists
  let fileExisted = false;
  if (fs.existsSync(filePath)) {
    fileExisted = true;
    const existing = fs.readFileSync(filePath, 'utf-8');
    if (existing.trim() !== fileContent.trim()) {
      throw new Error(
        `Conflict: Scenario "${scenario.id}" is already published with different content. Scenario IDs are immutable and cannot be overwritten.`
      );
    }
    console.log(`✓ Scenario file "${filePath}" already exists with identical content.`);
  } else {
    try {
      // Stage file first
      fs.writeFileSync(stagingPath, fileContent, 'utf-8');

      // Rename atomically to target
      fs.renameSync(stagingPath, filePath);
      console.log(`✓ Saved scenario file: ${filePath}`);
    } catch (err) {
      if (fs.existsSync(stagingPath)) {
        fs.unlinkSync(stagingPath);
      }
      throw err;
    }
  }

  // Verify integrity
  const publishedContent = fs.readFileSync(filePath, 'utf-8');
  if (!publishedContent.includes(scenario.id)) {
    throw new Error('Integrity check failed: Published file content corrupt.');
  }

  // Update src/scenarios/index.ts to register the newly approved scenario
  const indexPath = path.resolve(ROOT_DIR, 'src', 'scenarios', 'index.ts');
  let indexContent = fs.readFileSync(indexPath, 'utf-8');

  const varName = `GENERATED_SCENARIO_${scenario.id.replace(/[^A-Za-z0-9_]/g, '_').toUpperCase()}`;
  const importStmt = `import { ${varName} } from './generated/${scenario.id}';\n`;

  if (!indexContent.includes(varName)) {
    indexContent = importStmt + indexContent;
    indexContent = indexContent.replace(
      'export const SCENARIO_BANK: Scenario[] = [',
      `export const SCENARIO_BANK: Scenario[] = [\n  ${varName},`
    );
    fs.writeFileSync(indexPath, indexContent, 'utf-8');
    console.log(`✓ Registered scenario in SCENARIO_BANK in src/scenarios/index.ts`);
  } else {
    if (fileExisted) {
      console.log(`✓ Safe idempotent retry: Scenario "${scenario.id}" is already registered in registry.`);
    } else {
      console.log(`✓ Registered scenario in SCENARIO_BANK in src/scenarios/index.ts`);
    }
  }

  // Post-publication verification through registry file
  const verifiedIndex = fs.readFileSync(indexPath, 'utf-8');
  if (!verifiedIndex.includes(varName) || !verifiedIndex.includes(`import { ${varName} }`)) {
    throw new Error(`Registry verification failed: Scenario "${scenario.id}" is missing from src/scenarios/index.ts.`);
  }
}

// Main Execution Flow
async function main() {
  try {
    let scenario;
    let draftSha256 = null;

    if (isApprove) {
      // APPROVE MODE: Must consume existing reviewed draft locally.
      // ZERO Bedrock calls — BedrockRuntimeClient is NEVER invoked!
      console.log('\n🔒 RUNNING IN APPROVAL MODE: Consuming reviewed draft (Bedrock is NOT contacted).');
      const loaded = loadDraft(draftArg);
      scenario = loaded.scenario;
      draftSha256 = loaded.sha256;

      // Allow version bump or ID override if provided on approve
      if (customVersion) {
        console.log(`[Version Override] Updating scenario version: ${scenario.version} -> ${customVersion}`);
        scenario.version = customVersion;
        draftSha256 = crypto.createHash('sha256').update(JSON.stringify(scenario, null, 2)).digest('hex');
      }
      if (customId) {
        scenario.id = customId;
      }

      // Re-run the local deterministic SQLite Playability Gate
      await runPlayabilityGate(scenario);

      // Publish scenario immutably
      publishScenario(scenario, draftSha256);

      console.log('\n' + '='.repeat(70));
      console.log('  🎉 SCENARIO SUCCESSFULLY APPROVED AND PUBLISHED!');
      console.log('='.repeat(70));
      console.log(`Scenario ID:         ${scenario.id}`);
      console.log(`Scenario Version:    ${scenario.version}`);
      console.log(`Title:               ${scenario.title}`);
      console.log(`Ticket ID:           ${scenario.ticketId}`);
      console.log(`Target:              #${scenario.targetRegistrationId} -> ${scenario.targetExpectedStatus}`);
      console.log(`Bedrock Contact:     NONE (0 network calls; approval executed 100% offline).`);
      console.log(`Local Registration:  SUCCESS (Registered in src/scenarios/generated/${scenario.id}.ts and src/scenarios/index.ts)`);
      console.log(`Public Deployment:   PENDING (Run 'npm run build' and deploy to CloudFront to serve live)`);
      console.log('='.repeat(70));
    } else {
      // PREVIEW MODE: Drafts scenario and saves locally for review
      if (draftArg) {
        // Inspect an existing draft
        const loaded = loadDraft(draftArg);
        scenario = loaded.scenario;
        draftSha256 = loaded.sha256;
      } else {
        // Generate a new draft using Bedrock
        const creative = await generateCreativeDraft();
        scenario = assembleScenario(creative, exerciseType, {
          id: customId,
          version: customVersion,
        });
      }

      // Run SQLite Playability Gate
      await runPlayabilityGate(scenario);

      // Save draft to disk
      const saved = saveDraft(scenario);

      console.log('\n' + '='.repeat(70));
      console.log('  ASSEMBLED SCENARIO SUMMARY FOR INSTRUCTOR REVIEW');
      console.log('='.repeat(70));
      console.log(`Scenario ID:  ${scenario.id}`);
      console.log(`Version:      ${scenario.version}`);
      console.log(`Title:        ${scenario.title}`);
      console.log(`Ticket ID:    ${scenario.ticketId}`);
      console.log(`Ticket Text:  "${scenario.ticketDescription}"`);
      console.log(`Target:       #${scenario.targetRegistrationId} -> ${scenario.targetExpectedStatus}`);
      console.log(`Reviewer Row: #${scenario.exercises[0].reviewerDefaultPreset.registration_id} (${scenario.exercises[0].reviewerDefaultPreset.student_name}, ${scenario.exercises[0].reviewerDefaultPreset.event_name})`);
      console.log(`Starter SQL:  ${scenario.exercises[0].starterSql.replace(/\n/g, ' ')}`);
      console.log(`Solution SQL: ${scenario.exercises[0].solutionSql.replace(/\n/g, ' ')}`);
      console.log(`Draft Digest: ${saved.sha256}`);
      console.log('-'.repeat(70));
      console.log('\n📋 TO APPROVE AND PUBLISH THIS EXACT REVIEWED DRAFT:');
      console.log(`   node scripts/authorChallenge.mjs --approve --draft ${scenario.id} --digest ${saved.sha256}`);
      console.log('   Note: Approval consumes the local draft and will work even if Bedrock is offline.');
      console.log('='.repeat(70));
    }
  } catch (err) {
    console.error('\n❌ Authoring Error:', err.message || err);
    process.exit(1);
  }
}

main();
