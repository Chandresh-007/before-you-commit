export interface SqlValidationResult {
  isValid: boolean;
  error?: string;
  sanitizedSql?: string;
}

const MAX_SQL_LENGTH = 4096;

/**
 * Strips comments from SQL while keeping all quoted string literals
 * and quoted identifiers 100% intact.
 */
export function stripSqlCommentsPreservingQuotes(sql: string): string {
  let result = '';
  let inSingleQuote = false;
  let inDoubleQuote = false;
  let inBacktick = false;
  let inBracket = false;
  let inLineComment = false;
  let inBlockComment = false;

  for (let i = 0; i < sql.length; i++) {
    const char = sql[i];
    const nextChar = i + 1 < sql.length ? sql[i + 1] : '';

    if (inLineComment) {
      if (char === '\n' || char === '\r') {
        inLineComment = false;
        result += '\n';
      }
      continue;
    }

    if (inBlockComment) {
      if (char === '*' && nextChar === '/') {
        inBlockComment = false;
        i++; // skip /
        result += ' ';
      }
      continue;
    }

    if (inSingleQuote) {
      result += char;
      if (char === "'") {
        if (nextChar === "'") {
          // Escaped single quote ('')
          result += nextChar;
          i++;
        } else {
          inSingleQuote = false;
        }
      }
      continue;
    }

    if (inDoubleQuote) {
      result += char;
      if (char === '"') {
        if (nextChar === '"') {
          // Escaped double quote ("")
          result += nextChar;
          i++;
        } else {
          inDoubleQuote = false;
        }
      }
      continue;
    }

    if (inBacktick) {
      result += char;
      if (char === '`') {
        inBacktick = false;
      }
      continue;
    }

    if (inBracket) {
      result += char;
      if (char === ']') {
        inBracket = false;
      }
      continue;
    }

    // Normal mode: detect starts of quotes or comments
    if (char === '-' && nextChar === '-') {
      inLineComment = true;
      i++; // skip second -
      continue;
    }

    if (char === '/' && nextChar === '*') {
      inBlockComment = true;
      i++; // skip *
      continue;
    }

    if (char === "'") {
      inSingleQuote = true;
      result += char;
      continue;
    }

    if (char === '"') {
      inDoubleQuote = true;
      result += char;
      continue;
    }

    if (char === '`') {
      inBacktick = true;
      result += char;
      continue;
    }

    if (char === '[') {
      inBracket = true;
      result += char;
      continue;
    }

    result += char;
  }

  return result;
}

/**
 * Splits SQL into individual statements by semicolon, ignoring semicolons
 * inside quotes.
 */
export function splitSqlStatements(sql: string): string[] {
  const statements: string[] = [];
  let current = '';
  let inSingleQuote = false;
  let inDoubleQuote = false;
  let inBacktick = false;
  let inBracket = false;

  for (let i = 0; i < sql.length; i++) {
    const char = sql[i];
    const nextChar = i + 1 < sql.length ? sql[i + 1] : '';

    if (inSingleQuote) {
      current += char;
      if (char === "'") {
        if (nextChar === "'") {
          current += nextChar;
          i++;
        } else {
          inSingleQuote = false;
        }
      }
      continue;
    }

    if (inDoubleQuote) {
      current += char;
      if (char === '"') {
        if (nextChar === '"') {
          current += nextChar;
          i++;
        } else {
          inDoubleQuote = false;
        }
      }
      continue;
    }

    if (inBacktick) {
      current += char;
      if (char === '`') inBacktick = false;
      continue;
    }

    if (inBracket) {
      current += char;
      if (char === ']') inBracket = false;
      continue;
    }

    if (char === "'") {
      inSingleQuote = true;
      current += char;
      continue;
    }

    if (char === '"') {
      inDoubleQuote = true;
      current += char;
      continue;
    }

    if (char === '`') {
      inBacktick = true;
      current += char;
      continue;
    }

    if (char === '[') {
      inBracket = true;
      current += char;
      continue;
    }

    if (char === ';') {
      if (current.trim()) {
        statements.push(current.trim());
      }
      current = '';
      continue;
    }

    current += char;
  }

  if (current.trim()) {
    statements.push(current.trim());
  }

  return statements;
}

/**
 * Finds index of keyword in SQL outside of any quotes.
 */
function findKeywordOutsideQuotes(sql: string, keyword: string): number {
  const regex = new RegExp(`\\b${keyword}\\b`, 'i');
  let inSingleQuote = false;
  let inDoubleQuote = false;
  let inBacktick = false;
  let inBracket = false;

  for (let i = 0; i < sql.length; i++) {
    const char = sql[i];
    const nextChar = i + 1 < sql.length ? sql[i + 1] : '';

    if (inSingleQuote) {
      if (char === "'") {
        if (nextChar === "'") i++;
        else inSingleQuote = false;
      }
      continue;
    }
    if (inDoubleQuote) {
      if (char === '"') {
        if (nextChar === '"') i++;
        else inDoubleQuote = false;
      }
      continue;
    }
    if (inBacktick) {
      if (char === '`') inBacktick = false;
      continue;
    }
    if (inBracket) {
      if (char === ']') inBracket = false;
      continue;
    }

    if (char === "'") {
      inSingleQuote = true;
      continue;
    }
    if (char === '"') {
      inDoubleQuote = true;
      continue;
    }
    if (char === '`') {
      inBacktick = true;
      continue;
    }
    if (char === '[') {
      inBracket = true;
      continue;
    }

    // Check if keyword starts at index i
    const sub = sql.slice(i);
    const match = sub.match(regex);
    if (match && match.index === 0) {
      return i;
    }
  }

  return -1;
}

/**
 * Splits text by commas outside quotes.
 */
function splitByCommaOutsideQuotes(text: string): string[] {
  const parts: string[] = [];
  let current = '';
  let inSingleQuote = false;
  let inDoubleQuote = false;
  let inBacktick = false;
  let inBracket = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const nextChar = i + 1 < text.length ? text[i + 1] : '';

    if (inSingleQuote) {
      current += char;
      if (char === "'") {
        if (nextChar === "'") {
          current += nextChar;
          i++;
        } else {
          inSingleQuote = false;
        }
      }
      continue;
    }
    if (inDoubleQuote) {
      current += char;
      if (char === '"') {
        if (nextChar === '"') {
          current += nextChar;
          i++;
        } else {
          inDoubleQuote = false;
        }
      }
      continue;
    }
    if (inBacktick) {
      current += char;
      if (char === '`') inBacktick = false;
      continue;
    }
    if (inBracket) {
      current += char;
      if (char === ']') inBracket = false;
      continue;
    }

    if (char === "'") {
      inSingleQuote = true;
      current += char;
      continue;
    }
    if (char === '"') {
      inDoubleQuote = true;
      current += char;
      continue;
    }
    if (char === '`') {
      inBacktick = true;
      current += char;
      continue;
    }
    if (char === '[') {
      inBracket = true;
      current += char;
      continue;
    }

    if (char === ',') {
      if (current.trim()) {
        parts.push(current.trim());
      }
      current = '';
      continue;
    }

    current += char;
  }

  if (current.trim()) {
    parts.push(current.trim());
  }

  return parts;
}

/**
 * Enforces the scenario constraint:
 * Exactly one UPDATE statement targeting registrations, with status as the only editable column.
 * Quoted string literals are preserved verbatim.
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

  const cleanSql = stripSqlCommentsPreservingQuotes(sql).trim();

  if (!cleanSql) {
    return { isValid: false, error: 'Query cannot be empty after removing comments.' };
  }

  const statements = splitSqlStatements(cleanSql);

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
  const updateTableMatch = statement.match(/^\s*UPDATE\s+["`'[]?([A-Za-z0-9_]+)["`'\]]?/i);
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

  // Find SET keyword outside quotes
  const setIndex = findKeywordOutsideQuotes(statement, 'SET');
  if (setIndex === -1) {
    return {
      isValid: false,
      error: 'Syntax error: UPDATE statement is missing the SET clause.',
    };
  }

  const afterSet = statement.slice(setIndex + 3).trim();
  const whereIndex = findKeywordOutsideQuotes(afterSet, 'WHERE');
  if (whereIndex === -1) {
    return {
      isValid: false,
      error: 'Safety constraint violation: UPDATE statement must contain a WHERE clause to prevent unconditional whole-table modification.',
    };
  }

  const setClause = afterSet.slice(0, whereIndex).trim();
  const whereClause = afterSet.slice(whereIndex + 5).trim();

  if (!whereClause) {
    return {
      isValid: false,
      error: 'Safety constraint violation: WHERE clause cannot be empty.',
    };
  }

  // Validate assignments in SET clause
  const assignments = splitByCommaOutsideQuotes(setClause);

  if (assignments.length === 0) {
    return {
      isValid: false,
      error: 'Syntax error: No columns specified in SET clause.',
    };
  }

  for (const assign of assignments) {
    const colMatch = assign.match(/^\s*["`'[]?([A-Za-z0-9_]+)["`'\]]?\s*=/);
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
