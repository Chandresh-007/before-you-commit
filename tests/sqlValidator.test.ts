import { describe, it, expect } from 'vitest';
import { validateStudentSql, stripSqlCommentsPreservingQuotes, splitSqlStatements } from '../src/engine/sqlValidator';

describe('SQL Validator & Tokenizer Contract Tests', () => {
  describe('Comment Stripping and Quote Preservation', () => {
    it('preserves single-line comment markers inside single-quoted strings', () => {
      const sql = "UPDATE registrations SET status = 'cancelled' WHERE event_name = 'Cloud Quest -- Level 1';";
      const stripped = stripSqlCommentsPreservingQuotes(sql);
      expect(stripped).toContain("'Cloud Quest -- Level 1'");
    });

    it('preserves block comment markers inside single-quoted strings', () => {
      const sql = "UPDATE registrations SET status = 'cancelled' WHERE event_name = 'Cloud Quest /* Level 1 */';";
      const stripped = stripSqlCommentsPreservingQuotes(sql);
      expect(stripped).toContain("'Cloud Quest /* Level 1 */'");
    });

    it('preserves escaped single quotes inside strings', () => {
      const sql = "UPDATE registrations SET status = 'cancelled' WHERE student_name = 'Ananya''s Event';";
      const stripped = stripSqlCommentsPreservingQuotes(sql);
      expect(stripped).toContain("'Ananya''s Event'");
    });

    it('preserves semicolons inside single-quoted strings', () => {
      const sql = "UPDATE registrations SET status = 'cancelled' WHERE event_name = 'Session A; Session B';";
      const statements = splitSqlStatements(sql);
      expect(statements.length).toBe(1);
      expect(statements[0]).toContain("'Session A; Session B'");
    });

    it('strips genuine SQL comments outside quotes', () => {
      const sql = `-- Top comment
UPDATE registrations
/* multi-line
comment */
SET status = 'cancelled' -- inline comment
WHERE registration_id = 104;`;
      const result = validateStudentSql(sql);
      expect(result.isValid).toBe(true);
      expect(result.sanitizedSql).not.toContain('Top comment');
      expect(result.sanitizedSql).not.toContain('multi-line');
      expect(result.sanitizedSql).not.toContain('inline comment');
      expect(result.sanitizedSql).toContain("SET status = 'cancelled'");
      expect(result.sanitizedSql).toContain('WHERE registration_id = 104');
    });
  });

  describe('Enforcement of Supported SQLite UPDATE Form', () => {
    it('accepts standard UPDATE statement with status modification', () => {
      const sql = "UPDATE registrations SET status = 'cancelled' WHERE registration_id = 204;";
      const result = validateStudentSql(sql);
      expect(result.isValid).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it('accepts quoted table and column names', () => {
      const sql = "UPDATE \"registrations\" SET \"status\" = 'cancelled' WHERE registration_id = 204;";
      const result = validateStudentSql(sql);
      expect(result.isValid).toBe(true);
    });

    it('accepts backtick and bracket quoted identifiers', () => {
      const sql1 = "UPDATE `registrations` SET `status` = 'cancelled' WHERE registration_id = 204;";
      expect(validateStudentSql(sql1).isValid).toBe(true);

      const sql2 = "UPDATE [registrations] SET [status] = 'cancelled' WHERE registration_id = 204;";
      expect(validateStudentSql(sql2).isValid).toBe(true);
    });

    it('rejects empty queries or comment-only queries', () => {
      expect(validateStudentSql('').isValid).toBe(false);
      expect(validateStudentSql('   ').isValid).toBe(false);
      expect(validateStudentSql('-- only a comment').isValid).toBe(false);
      expect(validateStudentSql('/* only block comment */').isValid).toBe(false);
    });

    it('rejects non-UPDATE statements', () => {
      expect(validateStudentSql('SELECT * FROM registrations;').error).toContain('Only UPDATE statements are permitted');
      expect(validateStudentSql('DELETE FROM registrations WHERE registration_id = 104;').error).toContain('Only UPDATE statements are permitted');
      expect(validateStudentSql('INSERT INTO registrations VALUES (1, "a", "b", "c", "d", "e");').error).toContain('Only UPDATE statements are permitted');
      expect(validateStudentSql('DROP TABLE registrations;').error).toContain('Only UPDATE statements are permitted');
    });

    it('rejects queries targeting tables other than registrations', () => {
      const res = validateStudentSql("UPDATE students SET status = 'cancelled' WHERE id = 1;");
      expect(res.isValid).toBe(false);
      expect(res.error).toContain('Invalid target table');
    });

    it('rejects queries attempting to modify non-status columns', () => {
      const res1 = validateStudentSql("UPDATE registrations SET student_name = 'Aarav' WHERE registration_id = 204;");
      expect(res1.isValid).toBe(false);
      expect(res1.error).toContain('Cannot modify column "student_name"');

      const res2 = validateStudentSql("UPDATE registrations SET status = 'cancelled', student_id = 'STU-999' WHERE registration_id = 204;");
      expect(res2.isValid).toBe(false);
      expect(res2.error).toContain('Cannot modify column "student_id"');

      const res3 = validateStudentSql("UPDATE registrations SET event_name = 'Hacked' WHERE registration_id = 204;");
      expect(res3.isValid).toBe(false);
      expect(res3.error).toContain('Cannot modify column "event_name"');
    });

    it('rejects multiple statements', () => {
      const sql = "UPDATE registrations SET status = 'cancelled' WHERE registration_id = 104; DROP TABLE registrations;";
      const res = validateStudentSql(sql);
      expect(res.isValid).toBe(false);
      expect(res.error).toContain('Only exactly one SQL statement is permitted');
    });

    it('rejects UPDATE statements without WHERE clause', () => {
      const sql = "UPDATE registrations SET status = 'cancelled';";
      const res = validateStudentSql(sql);
      expect(res.isValid).toBe(false);
      expect(res.error).toContain('WHERE clause');
    });
  });
});
