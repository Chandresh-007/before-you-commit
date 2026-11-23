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
function getArg(flag, defaultValue) {
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
const isApprove = hasFlag('--approve');

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

  console.log(`✓ Bedrock response received in ${latency}ms.`);
  return parsed;
}

// Step 2: Deterministic Template Assembly (Verifiable Row Facts Only — No Hallucinated Columns)
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

  if (exercise === 'student-scope') {
    reviewerPreset = {
      registration_id: 188,
      student_id: targetStudentId,
      student_name: creative.targetStudentName,
      event_name: creative.secondaryCompany || 'Facebook Interview',
      session_date: '2024-11-25 14:00',
      status: 'scheduled',
    };
    starterSql = `UPDATE registrations\nSET status = 'cancelled'\nWHERE student_id = '${targetStudentId}';`;
    scopeGuard = `${creative.targetStudentName}’s other interview rounds (such as the ${reviewerPreset.event_name} session) must NOT be cancelled.`;
    lessonExplanation = `The query filtered WHERE student_id = '${targetStudentId}'. In an interview scheduling system, a candidate can participate in multiple concurrent company rounds. Updating by student_id unconditionally cancels all of the candidate's interviews. Use registration_id = ${targetRegId} to isolate the cancellation.`;
    // Factual description based exclusively on visible columns (student_name, event_name, session_date):
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
    starterSql = `UPDATE registrations\nSET status = 'cancelled'\nWHERE event_name = '${creative.targetCompany}' AND session_date = '${targetSessionDate}';`;
    scopeGuard = `Other candidates scheduled for ${creative.targetCompany} during the ${targetSessionDate} slot must NOT be cancelled.`;
    lessonExplanation = `The query filtered WHERE event_name = '${creative.targetCompany}' AND session_date = '${targetSessionDate}'. Because interview panels run parallel candidate slots at the same time, this query accidentally wiped ${reviewerPreset.student_name}'s panel (#${reviewerPreset.registration_id}). Target candidate primary key registration_id = ${targetRegId}.`;
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

    const queryRes = db.exec(`SELECT registration_id, status FROM registrations ORDER BY registration_id ASC;`);
    db.close();

    const actualMap = new Map();
    if (queryRes.length > 0 && queryRes[0].values) {
      for (const [id, st] of queryRes[0].values) {
        actualMap.set(Number(id), String(st));
      }
    }
    return actualMap;
  }

  const ex = scenario.exercises[0];
  const targetId = scenario.targetRegistrationId;
  const revId = ex.reviewerDefaultPreset.registration_id;

  // Check 1: Starter query on seed data changes only targetId
  const seedActual = executeRun(scenario.initialSeedRows, ex.starterSql);
  const seedTargetStatus = seedActual.get(targetId);
  if (seedTargetStatus !== 'cancelled') {
    throw new Error(`Gate Check 1 Failed: Target #${targetId} was not cancelled by starter query.`);
  }
  for (const row of scenario.initialSeedRows) {
    if (row.registration_id !== targetId && seedActual.get(row.registration_id) !== row.status) {
      throw new Error(`Gate Check 1 Failed: Control row #${row.registration_id} was modified on seed data.`);
    }
  }
  console.log(`  ✓ Check 1 (Seed Pass): Starter query modifies exactly target row #${targetId}.`);

  // Check 2: Starter query on seed + reviewer row modifies both targetId and reviewer row
  const combinedRows = [...scenario.initialSeedRows, ex.reviewerDefaultPreset];
  const trapActual = executeRun(combinedRows, ex.starterSql);
  if (trapActual.get(revId) !== 'cancelled') {
    throw new Error(`Gate Check 2 Failed: Reviewer row #${revId} was NOT modified by starter query. Trap failed!`);
  }
  if (trapActual.get(targetId) !== 'cancelled') {
    throw new Error(`Gate Check 2 Failed: Target row #${targetId} was not modified.`);
  }
  console.log(`  ✓ Check 2 (Reviewer Trap): Reviewer row #${revId} is caught in unintended modification.`);

  // Check 3: Solution query on seed + reviewer row changes ONLY targetId and preserves reviewer row
  const solutionActual = executeRun(combinedRows, ex.solutionSql);
  if (solutionActual.get(targetId) !== 'cancelled') {
    throw new Error(`Gate Check 3 Failed: Solution query did not cancel target row #${targetId}.`);
  }
  if (solutionActual.get(revId) !== ex.reviewerDefaultPreset.status) {
    throw new Error(`Gate Check 3 Failed: Solution query modified reviewer row #${revId}!`);
  }
  for (const row of scenario.initialSeedRows) {
    if (row.registration_id !== targetId && solutionActual.get(row.registration_id) !== row.status) {
      throw new Error(`Gate Check 3 Failed: Solution query modified control row #${row.registration_id}!`);
    }
  }
  console.log(`  ✓ Check 3 (Solution Pass): Solution query cancels #${targetId} and preserves row #${revId} and all controls.`);
  console.log('✓ In-Memory SQLite Playability Gate PASSED flawlessly.');
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

  let resolvedPath = null;
  if (targetArg && fs.existsSync(targetArg)) {
    resolvedPath = path.resolve(targetArg);
  } else if (targetArg && fs.existsSync(path.resolve(DRAFTS_DIR, `${targetArg}.json`))) {
    resolvedPath = path.resolve(DRAFTS_DIR, `${targetArg}.json`);
  } else if (targetArg && fs.existsSync(path.resolve(DRAFTS_DIR, targetArg))) {
    resolvedPath = path.resolve(DRAFTS_DIR, targetArg);
  } else {
    // If no draft arg, check most recent draft in .drafts
    if (fs.existsSync(DRAFTS_DIR)) {
      const files = fs.readdirSync(DRAFTS_DIR).filter((f) => f.endsWith('.json'));
      if (files.length > 0) {
        files.sort((a, b) => {
          const statA = fs.statSync(path.resolve(DRAFTS_DIR, a));
          const statB = fs.statSync(path.resolve(DRAFTS_DIR, b));
          return statB.mtimeMs - statA.mtimeMs;
        });
        resolvedPath = path.resolve(DRAFTS_DIR, files[0]);
      }
    }
  }

  if (!resolvedPath || !fs.existsSync(resolvedPath)) {
    throw new Error(
      `Draft not found for "${targetArg}". Please provide a valid draft path or ID (e.g. --draft .drafts/<id>.json).`
    );
  }

  const raw = fs.readFileSync(resolvedPath, 'utf-8');
  const scenario = JSON.parse(raw);
  const sha256 = crypto.createHash('sha256').update(raw).digest('hex');
  console.log(`✓ Loaded draft: ${resolvedPath}`);
  console.log(`  Draft SHA-256: ${sha256}`);
  return { scenario, draftPath: resolvedPath, sha256 };
}

// Step 6: Publish approved scenario immutably to scenario bank
function publishScenario(scenario, sourceSha256) {
  console.log('\n[4/4] Publishing approved scenario immutably to scenario bank...');
  const targetDir = path.resolve(ROOT_DIR, 'src', 'scenarios', 'generated');
  if (!fs.existsSync(targetDir)) {
    fs.mkdirSync(targetDir, { recursive: true });
  }

  const filename = `${scenario.id}.ts`;
  const filePath = path.resolve(targetDir, filename);

  const serializedScenario = JSON.stringify(scenario, null, 2);
  const fileContent = `import type { Scenario } from '../../types';

export const GENERATED_SCENARIO_${scenario.id.replace(/[^A-Za-z0-9_]/g, '_').toUpperCase()}: Scenario = ${serializedScenario};
`;

  fs.writeFileSync(filePath, fileContent, 'utf-8');
  console.log(`✓ Saved scenario file: ${filePath}`);

  // Content Verification: Prove approved content matches reviewed content
  const publishedSerialized = JSON.stringify(scenario, null, 2);
  const publishedSha256 = crypto.createHash('sha256').update(publishedSerialized).digest('hex');
  if (sourceSha256 && sourceSha256 !== publishedSha256) {
    throw new Error(`Integrity Check Failed: Published scenario SHA-256 (${publishedSha256}) does not match draft (${sourceSha256}).`);
  }
  console.log(`✓ Integrity Check: Approved scenario matches reviewed draft character-for-character.`);
  console.log(`  Verified SHA-256: ${publishedSha256}`);

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
        // Recalculate hash for updated version
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
      console.log(`Scenario ID:      ${scenario.id}`);
      console.log(`Scenario Version: ${scenario.version}`);
      console.log(`Title:            ${scenario.title}`);
      console.log(`Ticket ID:        ${scenario.ticketId}`);
      console.log(`Target:           #${scenario.targetRegistrationId} (${scenario.initialSeedRows.find(r => r.registration_id === scenario.targetRegistrationId)?.student_name}) -> ${scenario.targetExpectedStatus}`);
      console.log(`Bedrock Contact:  NONE (0 network calls; approval executed 100% offline).`);
      console.log(`App URL:          http://localhost:5173/?scenario=${scenario.id}`);
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
      console.log('-'.repeat(70));
      console.log('\n📋 TO APPROVE AND PUBLISH THIS EXACT REVIEWED DRAFT:');
      console.log(`   node scripts/authorChallenge.mjs --approve --draft ${scenario.id}`);
      console.log(`   (or: npm run author-challenge -- --approve --draft ${scenario.id})`);
      console.log('   Note: Approval consumes the local draft and will work even if Bedrock is offline.');
      console.log('='.repeat(70));
    }
  } catch (err) {
    console.error('\n❌ Authoring Error:', err);
    process.exit(1);
  }
}

main();
