import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand, GetCommand } from '@aws-sdk/lib-dynamodb';
import { randomBytes } from 'node:crypto';

// Types for API Gateway HTTP API v2 Event
interface APIGatewayHttpApiEvent {
  rawPath: string;
  requestContext: {
    requestId?: string;
    http: {
      method: string;
      path: string;
      sourceIp?: string;
      userAgent?: string;
    };
  };
  body?: string;
  isBase64Encoded?: boolean;
  pathParameters?: Record<string, string>;
}

interface APIGatewayResponse {
  statusCode: number;
  headers: Record<string, string>;
  body: string;
}

const TABLE_NAME = process.env.TABLE_NAME || 'before-you-commit-replays';
const REGION = process.env.AWS_REGION || 'ap-south-1';

const client = new DynamoDBClient({ region: REGION });
let docClient = DynamoDBDocumentClient.from(client, {
  marshallOptions: { removeUndefinedValues: true },
});

export function setDocClientForTesting(clientOverride: any) {
  docClient = clientOverride;
}

const CORS_HEADERS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

// Contract boundaries
const MAX_PAYLOAD_BYTES = 32 * 1024; // Exactly 32 KB in bytes
const MAX_SQL_LENGTH = 4096;
const MAX_REVIEWER_ROWS = 50;
const REPLAY_TTL_DAYS = 30;

function generateReplayId(): string {
  // 12-char cryptographically secure alphanumeric ID
  return randomBytes(8).toString('hex').slice(0, 12);
}

/**
 * Structured logger preserving privacy:
 * Never logs raw SQL queries or student names/IDs in routine operational logs.
 */
function logInfo(action: string, meta: Record<string, unknown>) {
  console.log(
    JSON.stringify({
      level: 'INFO',
      timestamp: new Date().toISOString(),
      action,
      ...meta,
    })
  );
}

function logError(action: string, error: unknown, meta: Record<string, unknown>) {
  console.error(
    JSON.stringify({
      level: 'ERROR',
      timestamp: new Date().toISOString(),
      action,
      errorMessage: error instanceof Error ? error.message : String(error),
      errorStack: error instanceof Error ? error.stack : undefined,
      ...meta,
    })
  );
}

export const handler = async (event: APIGatewayHttpApiEvent): Promise<APIGatewayResponse> => {
  const startTime = Date.now();
  const requestId = event.requestContext?.requestId || randomBytes(6).toString('hex');
  const method = event.requestContext?.http?.method?.toUpperCase() || 'GET';
  const path = event.rawPath || event.requestContext?.http?.path || '/';
  const clientIp = event.requestContext?.http?.sourceIp;

  // Handle CORS pre-flight
  if (method === 'OPTIONS') {
    return {
      statusCode: 204,
      headers: CORS_HEADERS,
      body: '',
    };
  }

  try {
    // Route: POST /replays
    if (method === 'POST' && (path === '/replays' || path.endsWith('/replays'))) {
      if (!event.body) {
        return {
          statusCode: 400,
          headers: CORS_HEADERS,
          body: JSON.stringify({ error: 'Request body is required.' }),
        };
      }

      const bodyStr = event.isBase64Encoded
        ? Buffer.from(event.body, 'base64').toString('utf-8')
        : event.body;

      const bodyBytes = Buffer.byteLength(bodyStr, 'utf-8');
      if (bodyBytes > MAX_PAYLOAD_BYTES) {
        logInfo('POST_REPLAY_REJECTED_SIZE', { requestId, bodyBytes, clientIp });
        return {
          statusCode: 413,
          headers: CORS_HEADERS,
          body: JSON.stringify({
            error: `Payload size (${bodyBytes} bytes) exceeds limit of ${MAX_PAYLOAD_BYTES} bytes.`,
          }),
        };
      }

      let payload: {
        scenarioId?: unknown;
        scenarioVersion?: unknown;
        exerciseId?: unknown;
        reviewerRows?: unknown;
        sql?: unknown;
      };

      try {
        payload = JSON.parse(bodyStr);
      } catch {
        return {
          statusCode: 400,
          headers: CORS_HEADERS,
          body: JSON.stringify({ error: 'Malformed JSON payload.' }),
        };
      }

      if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
        return {
          statusCode: 400,
          headers: CORS_HEADERS,
          body: JSON.stringify({ error: 'Request body must be a valid JSON object.' }),
        };
      }

      const { scenarioId, scenarioVersion, exerciseId, reviewerRows, sql } = payload;

      // 1. Validate SQL
      if (typeof sql !== 'string' || !sql.trim()) {
        return {
          statusCode: 400,
          headers: CORS_HEADERS,
          body: JSON.stringify({ error: 'Field "sql" is required and must be a non-empty string.' }),
        };
      }

      if (sql.length > MAX_SQL_LENGTH) {
        return {
          statusCode: 400,
          headers: CORS_HEADERS,
          body: JSON.stringify({
            error: `SQL text length (${sql.length}) exceeds maximum allowed length of ${MAX_SQL_LENGTH} characters.`,
          }),
        };
      }

      // 2. Validate Reviewer Rows
      if (!Array.isArray(reviewerRows)) {
        return {
          statusCode: 400,
          headers: CORS_HEADERS,
          body: JSON.stringify({ error: 'Field "reviewerRows" must be an array.' }),
        };
      }

      if (reviewerRows.length > MAX_REVIEWER_ROWS) {
        return {
          statusCode: 400,
          headers: CORS_HEADERS,
          body: JSON.stringify({
            error: `Reviewer rows count (${reviewerRows.length}) exceeds maximum limit of ${MAX_REVIEWER_ROWS}.`,
          }),
        };
      }

      const seenIds = new Set<number>();
      for (let i = 0; i < reviewerRows.length; i++) {
        const row = reviewerRows[i];
        if (!row || typeof row !== 'object') {
          return {
            statusCode: 400,
            headers: CORS_HEADERS,
            body: JSON.stringify({ error: `Reviewer row [${i}] must be an object.` }),
          };
        }

        const r = row as Record<string, unknown>;
        if (
          typeof r.registration_id !== 'number' ||
          !Number.isSafeInteger(r.registration_id) ||
          r.registration_id <= 0
        ) {
          return {
            statusCode: 400,
            headers: CORS_HEADERS,
            body: JSON.stringify({
              error: `Reviewer row [${i}] has invalid registration_id. Must be a positive integer.`,
            }),
          };
        }

        if (seenIds.has(r.registration_id)) {
          return {
            statusCode: 400,
            headers: CORS_HEADERS,
            body: JSON.stringify({
              error: `Duplicate registration_id #${r.registration_id} in reviewer rows. Primary keys must be unique.`,
            }),
          };
        }
        seenIds.add(r.registration_id);

        if (typeof r.student_id !== 'string' || !r.student_id.trim() || r.student_id.length > 64) {
          return {
            statusCode: 400,
            headers: CORS_HEADERS,
            body: JSON.stringify({ error: `Reviewer row [${i}] has invalid student_id.` }),
          };
        }

        if (typeof r.student_name !== 'string' || !r.student_name.trim() || r.student_name.length > 100) {
          return {
            statusCode: 400,
            headers: CORS_HEADERS,
            body: JSON.stringify({ error: `Reviewer row [${i}] has invalid student_name.` }),
          };
        }

        if (typeof r.event_name !== 'string' || !r.event_name.trim() || r.event_name.length > 100) {
          return {
            statusCode: 400,
            headers: CORS_HEADERS,
            body: JSON.stringify({ error: `Reviewer row [${i}] has invalid event_name.` }),
          };
        }

        if (typeof r.session_date !== 'string' || !r.session_date.trim() || r.session_date.length > 50) {
          return {
            statusCode: 400,
            headers: CORS_HEADERS,
            body: JSON.stringify({ error: `Reviewer row [${i}] has invalid session_date.` }),
          };
        }

        if (typeof r.status !== 'string' || !r.status.trim() || r.status.length > 30) {
          return {
            statusCode: 400,
            headers: CORS_HEADERS,
            body: JSON.stringify({ error: `Reviewer row [${i}] has invalid status.` }),
          };
        }
      }

      // 3. Validate Scenario ID and Version
      let cleanScenarioId: string | undefined;
      let cleanScenarioVersion = '1.0.0';

      if (scenarioId !== undefined && scenarioId !== null) {
        if (typeof scenarioId !== 'string' || !scenarioId.trim() || scenarioId.length > 64) {
          return {
            statusCode: 400,
            headers: CORS_HEADERS,
            body: JSON.stringify({ error: 'Field "scenarioId" must be a string up to 64 characters.' }),
          };
        }
        cleanScenarioId = scenarioId.trim();

        if (typeof scenarioVersion !== 'string' || !scenarioVersion.trim() || scenarioVersion.length > 32) {
          return {
            statusCode: 400,
            headers: CORS_HEADERS,
            body: JSON.stringify({ error: 'Field "scenarioVersion" is required when scenarioId is specified.' }),
          };
        }
        cleanScenarioVersion = scenarioVersion.trim();
      } else {
        if (scenarioVersion && scenarioVersion !== '1.0.0') {
          return {
            statusCode: 400,
            headers: CORS_HEADERS,
            body: JSON.stringify({ error: 'Legacy replays without scenarioId must use version "1.0.0".' }),
          };
        }
      }

      let cleanExerciseId: string | undefined;
      if (exerciseId !== undefined && exerciseId !== null) {
        if (typeof exerciseId !== 'string' || !exerciseId.trim() || exerciseId.length > 64) {
          return {
            statusCode: 400,
            headers: CORS_HEADERS,
            body: JSON.stringify({ error: 'Field "exerciseId" must be a string up to 64 characters.' }),
          };
        }
        cleanExerciseId = exerciseId.trim();
      }

      const replayId = generateReplayId();
      const now = Math.floor(Date.now() / 1000);
      const ttl = now + REPLAY_TTL_DAYS * 24 * 3600;

      const item = {
        id: replayId,
        scenarioId: cleanScenarioId,
        scenarioVersion: cleanScenarioVersion,
        exerciseId: cleanExerciseId,
        reviewerRows,
        sql,
        createdAt: new Date().toISOString(),
        ttl,
        expiresAt: ttl,
      };

      await docClient.send(
        new PutCommand({
          TableName: TABLE_NAME,
          Item: item,
        })
      );

      const latencyMs = Date.now() - startTime;
      logInfo('POST_REPLAY_SUCCESS', {
        requestId,
        replayId,
        scenarioId: cleanScenarioId,
        scenarioVersion: cleanScenarioVersion,
        reviewerRowsCount: reviewerRows.length,
        latencyMs,
      });

      return {
        statusCode: 201,
        headers: CORS_HEADERS,
        body: JSON.stringify({
          id: replayId,
          expiresAt: ttl,
          message: 'Replay recipe successfully saved to DynamoDB.',
        }),
      };
    }

    // Route: GET /replays/{id}
    if (method === 'GET' && path.includes('/replays/')) {
      const parts = path.split('/replays/');
      const rawId = parts[1] || event.pathParameters?.id || '';
      const replayId = decodeURIComponent(rawId.split('/')[0]).trim();

      if (!replayId || !/^[A-Za-z0-9_-]{1,64}$/.test(replayId)) {
        return {
          statusCode: 400,
          headers: CORS_HEADERS,
          body: JSON.stringify({ error: 'Invalid or missing replay ID format.' }),
        };
      }

      const result = await docClient.send(
        new GetCommand({
          TableName: TABLE_NAME,
          Key: { id: replayId },
        })
      );

      if (!result.Item) {
        logInfo('GET_REPLAY_NOT_FOUND', { requestId, replayId });
        return {
          statusCode: 404,
          headers: CORS_HEADERS,
          body: JSON.stringify({ error: `Replay with ID "${replayId}" not found.` }),
        };
      }

      const item = result.Item;
      const now = Math.floor(Date.now() / 1000);

      // Enforce TTL expiry on read
      if (item.ttl && item.ttl < now) {
        logInfo('GET_REPLAY_EXPIRED', { requestId, replayId, ttl: item.ttl, now });
        return {
          statusCode: 410,
          headers: CORS_HEADERS,
          body: JSON.stringify({ error: `Replay "${replayId}" has expired.` }),
        };
      }

      const latencyMs = Date.now() - startTime;
      logInfo('GET_REPLAY_SUCCESS', { requestId, replayId, latencyMs });

      return {
        statusCode: 200,
        headers: CORS_HEADERS,
        body: JSON.stringify({
          id: item.id,
          scenarioId: item.scenarioId,
          scenarioVersion: item.scenarioVersion,
          exerciseId: item.exerciseId,
          reviewerRows: item.reviewerRows,
          sql: item.sql,
          createdAt: item.createdAt,
          expiresAt: item.expiresAt,
        }),
      };
    }

    // Health check endpoint
    if (method === 'GET' && (path === '/health' || path === '/')) {
      return {
        statusCode: 200,
        headers: CORS_HEADERS,
        body: JSON.stringify({ status: 'ok', service: 'Before You Commit Replay API' }),
      };
    }

    return {
      statusCode: 404,
      headers: CORS_HEADERS,
      body: JSON.stringify({ error: `Route not found: ${method} ${path}` }),
    };
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    logError('UNHANDLED_EXCEPTION', err, { requestId, method, path });
    return {
      statusCode: 500,
      headers: CORS_HEADERS,
      body: JSON.stringify({ error: 'Internal server error', details: errorMsg }),
    };
  }
};
