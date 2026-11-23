import { it, expect, vi } from 'vitest';
import { writeFileSync, readFileSync, mkdirSync, copyFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { executeScenarioPreview } from '../../src/engine/sqlEngine';
import { validateStudentSql } from '../../src/engine/sqlValidator';
import { resolveScenarioAndExercise, getScenarioById } from '../../src/scenarios';
const evidence: Record<string, unknown> = {};
const scenario = getScenarioById('scenario-bedrock-student-scope-mwrs6sns')!;
const ex = scenario.exercises![0];

it('records boundary probes without changing application code', async () => {
  const bypass = "UPDATE registrations SET status = CASE WHEN 'WHERE'='WHERE' THEN 'cancelled' END, student_name='Changed outside permitted column' WHERE registration_id=204;";
  const report = await executeScenarioPreview({scenario,sql:bypass,reviewerRows:[]});
  const target = report.rows.find(r=>r.registration_id===204)!;
  evidence.sqlBypass = {validation:validateStudentSql(bypass),pass:report.summary.isPass,beforeName:target.before.student_name,afterName:target.after.student_name,changedColumns:target.changedColumns};
  const rewritten = "UPDATE registrations SET status='can/*comment*/celled' WHERE registration_id=204;";
  const rewrittenReport = await executeScenarioPreview({scenario,sql:rewritten});
  evidence.literalRewritten = {input:rewritten,sanitized:validateStudentSql(rewritten).sanitizedSql,pass:rewrittenReport.summary.isPass,actual:rewrittenReport.rows.find(r=>r.registration_id===204)?.after.status};
  const fakeTarget={...scenario.initialSeedRows.find(r=>r.registration_id===204)!,student_name:'Replacement Student'};
  const replaced = await executeScenarioPreview({scenario,sql:ex.solutionSql,reviewerRows:[fakeTarget]});
  evidence.seedOverwrite = {pass:replaced.summary.isPass,targetBefore:replaced.rows.find(r=>r.registration_id===204)?.before};
  evidence.unknownExercise = resolveScenarioAndExercise({scenarioId:scenario.id,scenarioVersion:scenario.version,exerciseId:'nonexistent-exercise',sql:ex.starterSql,reviewerRows:[]}).exercise.id;
  evidence.missingVersion = resolveScenarioAndExercise({scenarioId:scenario.id,sql:ex.starterSql,reviewerRows:[]} as any).scenario.version;
  // Isolate publisher writes in an audit fixture. No Bedrock call occurs in approval mode.
  const fixture=resolve('artifacts/review-audit/author-fixture');
  for(const dir of ['scripts','public','.drafts','src/scenarios/generated']) mkdirSync(resolve(fixture,dir),{recursive:true});
  copyFileSync('scripts/authorChallenge.mjs',resolve(fixture,'scripts/authorChallenge.mjs'));
  copyFileSync('public/sql-wasm.wasm',resolve(fixture,'public/sql-wasm.wasm'));
  const original=JSON.parse(JSON.stringify(scenario));
  const draft=resolve(fixture,'.drafts/reviewed.json');
  writeFileSync(draft,JSON.stringify(original,null,2));
  writeFileSync(resolve(fixture,'src/scenarios/index.ts'),'export const SCENARIO_BANK: Scenario[] = [];');
  const published=resolve(fixture,'src/scenarios/generated',scenario.id+'.ts');
  writeFileSync(published,'// Existing immutable version sentinel');
  const run=spawnSync(process.execPath,[resolve(fixture,'scripts/authorChallenge.mjs'),'--approve','--draft','definitely-not-a-real-draft'],{cwd:fixture,encoding:'utf8',timeout:15000});
  evidence.authorMissingDraft={exitCode:run.status,existingVersionOverwritten:readFileSync(published,'utf8')!=='// Existing immutable version sentinel',stdout:run.stdout,stderr:run.stderr};
  // Formatting-only change makes the hash check fail after the destination was already overwritten.
  writeFileSync(draft,JSON.stringify(original));
  writeFileSync(published,'// Existing immutable version sentinel');
  const hashRun=spawnSync(process.execPath,[resolve(fixture,'scripts/authorChallenge.mjs'),'--approve','--draft',draft],{cwd:fixture,encoding:'utf8',timeout:15000});
  evidence.authorFailedIntegrity={exitCode:hashRun.status,destinationChanged:readFileSync(published,'utf8')!=='// Existing immutable version sentinel',stderr:hashRun.stderr};
  writeFileSync('artifacts/review-audit/evidence.json',JSON.stringify(evidence,null,2));
  expect(Object.keys(evidence).length).toBe(7);
});
