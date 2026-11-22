export interface SqlValidationResult {
  isValid: boolean;
  error?: string;
  sanitizedSql?: string;
}

const MAX_SQL_LENGTH = 4096;

/**
 * Enforces the scenario constraint:
 * "accept exactly one UPDATE statement targeting registrations, with status as the only editable column.
 * Enforce this with SQL parsing or SQLite controls. Show a clear error for unsupported statements."
 */
export function validateStudentSql(sql: string): SqlValidationResult {
  if (!sql || typeof sql !== 'string') {
    return { isValid: false, error: 'Query cannot be empty.' };
  }

  if (sql.length > MAX_SQL_LENGTH) {
    return {
      isValid: false,
      error: `Query exceeds maximum allowed length of ${MAX_SQL_LENGTH} characters.`,
    };
  }

  // Remove comments (single line -- and multi-line /* ... */)
  const withoutBlockComments = sql.replace(/\/\*[\s\S]*?\*\//g, '');
  const withoutLineComments = withoutBlockComments.replace(/--.*$/gm, '');
  const cleanSql = withoutLineComments.trim();

  if (!cleanSql) {
    return { isValid: false, error: 'Query cannot be empty after removing comments.' };
  }

  // Check for multiple statements by checking semicolons not in strings
  // Simple state machine to split by semicolons outside quotes
  const statements: string[] = [];
  let currentStatement = '';
  let inSingleQuote = false;
  let inDoubleQuote = false;

  for (let i = 0; i < cleanSql.length; i++) {
    const char = cleanSql[i];
    if (char === "'" && !inDoubleQuote) {
      inSingleQuote = !inSingleQuote;
      currentStatement += char;
    } else if (char === '"' && !inSingleQuote) {
      inDoubleQuote = !inDoubleQuote;
      currentStatement += char;
    } else if (char === ';' && !inSingleQuote && !inDoubleQuote) {
      if (currentStatement.trim()) {
        statements.push(currentStatement.trim());
      }
      currentStatement = '';
    } else {
      currentStatement += char;
    }
  }
  if (currentStatement.trim()) {
    statements.push(currentStatement.trim());
  }

  if (statements.length === 0) {
    return { isValid: false, error: 'No valid SQL statement found.' };
  }

  if (statements.length > 1) {
    return {
      isValid: false,
      error: 'Security constraint violation: Only exactly one SQL statement is permitted per review.',
    };
  }

  const statement = statements[0];

  // Must start with UPDATE
  const firstWordMatch = statement.match(/^\s*([A-Za-z_]+)/i);
  if (!firstWordMatch) {
    return { isValid: false, error: 'Invalid SQL syntax.' };
  }

  const statementType = firstWordMatch[1].toUpperCase();
  if (statementType !== 'UPDATE') {
    return {
      isValid: false,
      error: `Unsupported statement "${statementType}". Only UPDATE statements are permitted for this change ticket.`,
    };
  }

  // Target table must be registrations
  // Pattern: UPDATE [optional quotes]registrations[optional quotes]
  const updateTableMatch = statement.match(/^\s*UPDATE\s+["`']?([A-Za-z0-9_]+)["`']?/i);
  if (!updateTableMatch) {
    return {
      isValid: false,
      error: 'Syntax error: Could not identify target table in UPDATE statement.',
    };
  }

  const targetTable = updateTableMatch[1].toLowerCase();
  if (targetTable !== 'registrations') {
    return {
      isValid: false,
      error: `Invalid target table "${targetTable}". This ticket only permits updating the "registrations" table.`,
    };
  }

  // Extract SET clause and WHERE clause
  // UPDATE registrations SET col1 = val1, col2 = val2 WHERE ...
  const setIndex = statement.search(/\bSET\b/i);
  if (setIndex === -1) {
    return {
      isValid: false,
      error: 'Syntax error: UPDATE statement is missing the SET clause.',
    };
  }

  const afterSet = statement.slice(setIndex + 3).trim();
  const whereIndex = afterSet.search(/\bWHERE\b/i);
  const setClause = whereIndex === -1 ? afterSet : afterSet.slice(0, whereIndex);

  // Validate columns assigned in SET clause
  // Split SET clause by commas outside quotes
  const assignments: string[] = [];
  let currentAssign = '';
  inSingleQuote = false;
  inDoubleQuote = false;

  for (let i = 0; i < setClause.length; i++) {
    const char = setClause[i];
    if (char === "'" && !inDoubleQuote) {
      inSingleQuote = !inSingleQuote;
      currentAssign += char;
    } else if (char === '"' && !inSingleQuote) {
      inDoubleQuote = !inDoubleQuote;
      currentAssign += char;
    } else if (char === ',' && !inSingleQuote && !inDoubleQuote) {
      assignments.push(currentAssign.trim());
      currentAssign = '';
    } else {
      currentAssign += char;
    }
  }
  if (currentAssign.trim()) {
    assignments.push(currentAssign.trim());
  }

  if (assignments.length === 0) {
    return {
      isValid: false,
      error: 'Syntax error: No columns specified in SET clause.',
    };
  }

  for (const assign of assignments) {
    const colMatch = assign.match(/^\s*["`']?([A-Za-z0-9_]+)["`']?\s*=/);
    if (!colMatch) {
      return {
        isValid: false,
        error: `Syntax error in SET assignment: "${assign}".`,
      };
    }

    const colName = colMatch[1].toLowerCase();
    if (colName !== 'status') {
      return {
        isValid: false,
        error: `Security constraint violation: Cannot modify column "${colName}". Only the "status" column is editable for this ticket.`,
      };
    }
  }

  return {
    isValid: true,
    sanitizedSql: statement,
  };
}
