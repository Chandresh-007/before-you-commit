import initSqlJs from 'sql.js';
import type { Database, SqlJsStatic } from 'sql.js';
import type { DiffReport, Registration, Scenario } from '../types';
import { validateStudentSql } from './sqlValidator';
import { computeDiffReport } from './diffEngine';

let sqlJsModule: SqlJsStatic | null = null;

export async function getSqlJs(locateFileUrl?: string): Promise<SqlJsStatic> {
  if (!sqlJsModule) {
    const isNode = typeof window === 'undefined' && typeof process !== 'undefined';

    sqlJsModule = await initSqlJs({
      locateFile: (file: string) => {
        if (locateFileUrl) {
          return `${locateFileUrl}/${file}`;
        }
        if (isNode) {
          return `./public/${file}`;
        }
        return `/${file}`;
      },
    } as unknown as Parameters<typeof initSqlJs>[0]);
  }
  return sqlJsModule;
}

export interface SqlExecutionOptions {
  scenario: Scenario;
  reviewerRows?: Registration[];
  sql: string;
  locateFileUrl?: string;
  customSqlJs?: SqlJsStatic;
}

/**
 * Creates a fresh, isolated in-memory SQLite database instance, seeds it with scenario
 * and reviewer rows, executes the validated SQL, and extracts the resulting rows.
 */
export async function executeScenarioPreview(
  options: SqlExecutionOptions
): Promise<DiffReport> {
  const startTime = performance.now();
  const { scenario, reviewerRows = [], sql, locateFileUrl, customSqlJs } = options;

  // 1. Enforce syntactic and safety constraints
  const validation = validateStudentSql(sql);
  if (!validation.isValid) {
    throw new Error(validation.error || 'SQL validation failed.');
  }

  // 2. Combine initial seed rows with reviewer rows
  // Reviewer rows must not overwrite initial seeds with the same ID, or conflict
  const combinedStartingMap = new Map<number, Registration>();
  for (const row of scenario.initialSeedRows) {
    combinedStartingMap.set(row.registration_id, row);
  }

  for (const revRow of reviewerRows) {
    combinedStartingMap.set(revRow.registration_id, revRow);
  }

  const startingRows = Array.from(combinedStartingMap.values()).sort(
    (a, b) => a.registration_id - b.registration_id
  );

  // 3. Initialize fresh SQLite database
  const SQL = customSqlJs || (await getSqlJs(locateFileUrl));
  const db: Database = new SQL.Database();

  try {
    // 4. Create registrations table
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

    // 5. Insert starting rows using prepared statement
    const insertStmt = db.prepare(`
      INSERT INTO registrations (registration_id, student_id, student_name, event_name, session_date, status)
      VALUES (?, ?, ?, ?, ?, ?);
    `);

    for (const row of startingRows) {
      insertStmt.run([
        row.registration_id,
        row.student_id,
        row.student_name,
        row.event_name,
        row.session_date,
        row.status,
      ]);
    }
    insertStmt.free();

    // 6. Execute user SQL statement
    db.run(validation.sanitizedSql || sql);

    // 7. Read back actual final state
    const queryResult = db.exec(`
      SELECT registration_id, student_id, student_name, event_name, session_date, status
      FROM registrations
      ORDER BY registration_id ASC;
    `);

    const actualRows: Registration[] = [];
    if (queryResult.length > 0 && queryResult[0].values) {
      for (const val of queryResult[0].values) {
        actualRows.push({
          registration_id: Number(val[0]),
          student_id: String(val[1]),
          student_name: String(val[2]),
          event_name: String(val[3]),
          session_date: String(val[4]),
          status: String(val[5]),
        });
      }
    }

    const executionTimeMs = Math.round((performance.now() - startTime) * 100) / 100;

    // 8. Compute row-by-row diff against starting state and ticket intent
    return computeDiffReport(scenario, startingRows, actualRows, sql, executionTimeMs);
  } finally {
    try {
      db.close();
    } catch {
      // Ignore cleanup error
    }
  }
}
