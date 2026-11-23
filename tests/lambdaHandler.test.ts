import { describe, it, expect, beforeEach } from 'vitest';
import { handler, setDocClientForTesting } from '../backend/src/handler';

describe('Lambda Handler & DynamoDB Test Double Contract Tests', () => {
  // In-memory DynamoDB test double table
  const dbTable = new Map<string, any>();

  beforeEach(() => {
    dbTable.clear();

    const testDoubleClient = {
      send: async (command: any) => {
        const cmdName = command.constructor?.name || '';
        if (cmdName === 'PutCommand' || command.input?.Item) {
          dbTable.set(command.input.Item.id, { ...command.input.Item });
          return {};
        }
        if (cmdName === 'GetCommand' || command.input?.Key) {
          const item = dbTable.get(command.input.Key.id);
          return { Item: item ? { ...item } : undefined };
        }
        return {};
      },
    };

    setDocClientForTesting(testDoubleClient);
  });

  const validPayload = {
    scenarioId: 'scenario-bedrock-student-scope-mwrs6sns',
    scenarioVersion: '1.1.0',
    exerciseId: 'student-scope',
    reviewerRows: [
      {
        registration_id: 188,
        student_id: 'STU-404',
        student_name: 'Aarav Patel',
        event_name: 'Facebook Interview',
        session_date: '2024-11-25 14:00',
        status: 'scheduled',
      },
    ],
    sql: "UPDATE registrations SET status = 'cancelled' WHERE registration_id = 204;",
  };

  it('successfully saves valid replay recipe and returns 201 with replay ID', async () => {
    const event = {
      rawPath: '/replays',
      requestContext: { http: { method: 'POST', path: '/replays' } },
      body: JSON.stringify(validPayload),
    };

    const res = await handler(event as any);
    expect(res.statusCode).toBe(201);

    const body = JSON.parse(res.body);
    expect(body.id).toMatch(/^[0-9a-f]{12}$/);
    expect(body.expiresAt).toBeDefined();

    // Verify written to database table with 30-day TTL
    const stored = dbTable.get(body.id);
    expect(stored).toBeDefined();
    expect(stored.scenarioId).toBe(validPayload.scenarioId);
    expect(stored.sql).toBe(validPayload.sql);
    expect(stored.reviewerRows).toHaveLength(1);
    expect(stored.ttl).toBeGreaterThan(Math.floor(Date.now() / 1000));
  });

  it('reads back saved replay via GET /replays/{id}', async () => {
    const postEvent = {
      rawPath: '/replays',
      requestContext: { http: { method: 'POST', path: '/replays' } },
      body: JSON.stringify(validPayload),
    };
    const postRes = await handler(postEvent as any);
    const { id } = JSON.parse(postRes.body);

    const getEvent = {
      rawPath: `/replays/${id}`,
      requestContext: { http: { method: 'GET', path: `/replays/${id}` } },
    };
    const getRes = await handler(getEvent as any);
    expect(getRes.statusCode).toBe(200);

    const record = JSON.parse(getRes.body);
    expect(record.id).toBe(id);
    expect(record.sql).toBe(validPayload.sql);
    expect(record.reviewerRows[0].registration_id).toBe(188);
  });

  it('rejects malformed JSON with HTTP 400 and creates no database record', async () => {
    const initialSize = dbTable.size;
    const event = {
      rawPath: '/replays',
      requestContext: { http: { method: 'POST', path: '/replays' } },
      body: '{ this is not valid json',
    };

    const res = await handler(event as any);
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).error).toContain('Malformed JSON');
    expect(dbTable.size).toBe(initialSize);
  });

  it('handles JSON null body gracefully with HTTP 400 without crashing with TypeError', async () => {
    const initialSize = dbTable.size;
    const event = {
      rawPath: '/replays',
      requestContext: { http: { method: 'POST', path: '/replays' } },
      body: 'null',
    };

    const res = await handler(event as any);
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).error).toContain('valid JSON object');
    expect(dbTable.size).toBe(initialSize);
  });

  it('rejects oversized payloads exceeding 32 KB with HTTP 413', async () => {
    const initialSize = dbTable.size;
    const largeSql = 'UPDATE registrations SET status = "cancelled" WHERE ' + 'x'.repeat(33 * 1024);
    const event = {
      rawPath: '/replays',
      requestContext: { http: { method: 'POST', path: '/replays' } },
      body: JSON.stringify({ ...validPayload, sql: largeSql }),
    };

    const res = await handler(event as any);
    expect(res.statusCode).toBe(413);
    expect(JSON.parse(res.body).error).toContain('exceeds limit');
    expect(dbTable.size).toBe(initialSize);
  });

  it('rejects invalid reviewer rows (non-positive integers or duplicates) and creates no record', async () => {
    const initialSize = dbTable.size;
    const duplicateRowsPayload = {
      ...validPayload,
      reviewerRows: [
        { ...validPayload.reviewerRows[0], registration_id: 200 },
        { ...validPayload.reviewerRows[0], registration_id: 200 }, // Duplicate!
      ],
    };

    const event = {
      rawPath: '/replays',
      requestContext: { http: { method: 'POST', path: '/replays' } },
      body: JSON.stringify(duplicateRowsPayload),
    };

    const res = await handler(event as any);
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).error).toContain('Duplicate registration_id');
    expect(dbTable.size).toBe(initialSize);
  });

  it('returns HTTP 404 for missing or non-existent replay records', async () => {
    const event = {
      rawPath: '/replays/nonexistent12',
      requestContext: { http: { method: 'GET', path: '/replays/nonexistent12' } },
    };

    const res = await handler(event as any);
    expect(res.statusCode).toBe(404);
    expect(JSON.parse(res.body).error).toContain('not found');
  });

  it('returns HTTP 410 for expired replay records exceeding retention', async () => {
    const expiredId = 'expired12345';
    dbTable.set(expiredId, {
      ...validPayload,
      id: expiredId,
      ttl: Math.floor(Date.now() / 1000) - 3600, // Expired 1 hour ago
    });

    const event = {
      rawPath: `/replays/${expiredId}`,
      requestContext: { http: { method: 'GET', path: `/replays/${expiredId}` } },
    };

    const res = await handler(event as any);
    expect(res.statusCode).toBe(410);
    expect(JSON.parse(res.body).error).toContain('expired');
  });
});
