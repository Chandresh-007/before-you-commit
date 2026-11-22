import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand, GetCommand } from '@aws-sdk/lib-dynamodb';
import { randomBytes } from 'node:crypto';

// Types for API Gateway HTTP API v2 Event
interface APIGatewayHttpApiEvent {
  rawPath: string;
  requestContext: {
    http: {
      method: string;
      path: string;
      sourceIp?: string;
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
const docClient = DynamoDBDocumentClient.from(client, {
  marshallOptions: { removeUndefinedValues: true },
});

const CORS_HEADERS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

// Size boundaries
const MAX_PAYLOAD_SIZE = 32 * 1024; // 32 KB
const MAX_SQL_LENGTH = 4096;
const MAX_REVIEWER_ROWS = 50;
const REPLAY_TTL_DAYS = 30;

function generateReplayId(): string {
  // 12-char secure alphanumeric ID
  return randomBytes(8).toString('hex').slice(0, 12);
}

export const handler = async (event: APIGatewayHttpApiEvent): Promise<APIGatewayResponse> => {
  const method = event.requestContext?.http?.method?.toUpperCase() || 'GET';
  const path = event.rawPath || event.requestContext?.http?.path || '/';

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

      if (bodyStr.length > MAX_PAYLOAD_SIZE) {
        return {
          statusCode: 413,
          headers: CORS_HEADERS,
          body: JSON.stringify({ error: `Payload exceeds limit of ${MAX_PAYLOAD_SIZE} bytes.` }),
        };
      }

      let payload: {
        scenarioVersion?: string;
        reviewerRows?: unknown[];
        sql?: string;
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

      const { scenarioVersion, reviewerRows, sql } = payload;

      if (!sql || typeof sql !== 'string') {
        return {
          statusCode: 400,
          headers: CORS_HEADERS,
          body: JSON.stringify({ error: 'Field "sql" is required and must be a string.' }),
        };
      }

      if (sql.length > MAX_SQL_LENGTH) {
        return {
          statusCode: 400,
          headers: CORS_HEADERS,
          body: JSON.stringify({ error: `SQL string exceeds maximum allowed length of ${MAX_SQL_LENGTH} chars.` }),
        };
      }

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
          body: JSON.stringify({ error: `Reviewer rows count exceeds maximum limit of ${MAX_REVIEWER_ROWS}.` }),
        };
      }

      const replayId = generateReplayId();
      const now = Math.floor(Date.now() / 1000);
      const ttl = now + REPLAY_TTL_DAYS * 24 * 3600;

      const item = {
        id: replayId,
        scenarioVersion: String(scenarioVersion || '1.0.0').slice(0, 32),
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
        return {
          statusCode: 404,
          headers: CORS_HEADERS,
          body: JSON.stringify({ error: `Replay with ID "${replayId}" not found.` }),
        };
      }

      const item = result.Item;
      const now = Math.floor(Date.now() / 1000);

      // Enforce expiry on reads
      if (item.ttl && item.ttl < now) {
        return {
          statusCode: 410,
          headers: CORS_HEADERS,
          body: JSON.stringify({ error: `Replay "${replayId}" has expired.` }),
        };
      }

      return {
        statusCode: 200,
        headers: CORS_HEADERS,
        body: JSON.stringify({
          id: item.id,
          scenarioVersion: item.scenarioVersion,
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
    console.error('Unhandled Lambda Error:', err);
    return {
      statusCode: 500,
      headers: CORS_HEADERS,
      body: JSON.stringify({ error: 'Internal server error', details: errorMsg }),
    };
  }
};
