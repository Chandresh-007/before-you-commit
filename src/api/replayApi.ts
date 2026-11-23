import type { ReplayRecipe } from '../types';
import { validateReplayRecipe, MAX_REPLAY_PAYLOAD_BYTES } from '../types/replayValidation';

// The backend API URL can be injected via Vite env or defaults to empty (local fallback)
const API_BASE_URL = import.meta.env.VITE_API_URL || '';

export type ShareOutcome = 'cloud' | 'local' | 'failure';

export interface ShareResult {
  outcome: ShareOutcome;
  success: boolean;
  replayId?: string;
  shareUrl: string;
  isCloudShared: boolean;
  error?: string;
  isTooLargeForUrl?: boolean;
}

/**
 * Encodes a replay recipe safely into a URL-friendly Base64 UTF-8 string.
 * Converts '+' to '-' and '/' to '_' and trims padding '=' to ensure URLSearchParams
 * never interprets '+' as a space character during round trips.
 */
export function encodeRecipeToHash(recipe: ReplayRecipe): string {
  const jsonStr = JSON.stringify(recipe);
  const bytes = new TextEncoder().encode(jsonStr);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  const base64 = btoa(binary);
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/**
 * Decodes a replay recipe from a Base64 UTF-8 string.
 * Supports standard Base64, URL-safe Base64, and recovers '+' characters
 * that may have been parsed as spaces by URLSearchParams for backwards compatibility.
 */
export function decodeRecipeFromHash(encoded: string): ReplayRecipe {
  let normalized = encoded.replace(/-/g, '+').replace(/_/g, '/').replace(/ /g, '+');
  while (normalized.length % 4 !== 0) {
    normalized += '=';
  }
  const binary = atob(normalized);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  const jsonStr = new TextDecoder().decode(bytes);
  return JSON.parse(jsonStr) as ReplayRecipe;
}

/**
 * Saves a replay recipe to AWS DynamoDB via API Gateway HTTP API.
 * If backend is unavailable or offline, falls back to URL fragment/hash encoding
 * while explicitly informing the user of the exact status.
 */
export async function saveReplay(recipe: ReplayRecipe): Promise<ShareResult> {
  const currentBaseUrl = window.location.origin + window.location.pathname;

  // Validate recipe before attempting cloud or local save
  const validation = validateReplayRecipe(recipe);
  if (!validation.valid) {
    throw new Error(`Cannot share invalid replay recipe: ${validation.error}`);
  }

  const payloadString = JSON.stringify({
    scenarioId: recipe.scenarioId,
    scenarioVersion: recipe.scenarioVersion,
    exerciseId: recipe.exerciseId,
    reviewerRows: recipe.reviewerRows,
    sql: recipe.sql,
  });

  const payloadBytes = new TextEncoder().encode(payloadString).length;
  if (payloadBytes > MAX_REPLAY_PAYLOAD_BYTES) {
    throw new Error(`Replay payload size (${payloadBytes} bytes) exceeds limit of ${MAX_REPLAY_PAYLOAD_BYTES} bytes.`);
  }

  if (API_BASE_URL) {
    try {
      const response = await fetch(`${API_BASE_URL}/replays`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: payloadString,
        signal: AbortSignal.timeout(8000),
      });

      if (!response.ok) {
        let errorDetail = '';
        try {
          const errJson = await response.json();
          errorDetail = errJson.error || errJson.details || (await response.text());
        } catch {
          errorDetail = await response.text();
        }

        if (response.status === 400 || response.status === 413) {
          throw new Error(`Replay rejected by cloud server (HTTP ${response.status}): ${errorDetail}`);
        }
        throw new Error(`Cloud persistence unavailable (HTTP ${response.status}): ${errorDetail}`);
      }

      const data = await response.json();
      const replayId = data.id || data.replayId;
      if (!replayId || typeof replayId !== 'string' || !/^[0-9a-f]{12}$/i.test(replayId)) {
        throw new Error('Cloud persistence response missing valid 12-character hexadecimal replay ID.');
      }
      const shareUrl = `${currentBaseUrl}?replay=${replayId}`;

      return {
        outcome: 'cloud',
        success: true,
        replayId,
        shareUrl,
        isCloudShared: true,
      };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      console.warn('Cloud replay saving failed, evaluating fallback:', message);

      // Distinguish rejected input from network/server outage:
      // Rejected input must NOT offer a broken or homepage link!
      if (message.includes('Replay rejected by cloud server')) {
        return {
          outcome: 'failure',
          success: false,
          shareUrl: '',
          isCloudShared: false,
          error: message,
        };
      }

      // Recoverable cloud outage / timeout / missing endpoint:
      // Encode locally into URL fragment (#localReplay=...)
      const encoded = encodeRecipeToHash(recipe);
      const shareUrl = `${currentBaseUrl}#localReplay=${encoded}`;
      const isTooLargeForUrl = shareUrl.length > 2000;

      return {
        outcome: 'local',
        success: true,
        shareUrl,
        isCloudShared: false,
        error: `Cloud save unavailable (${message}). A self-contained replay link is ready below.`,
        isTooLargeForUrl,
      };
    }
  }

  // If no cloud API configured, generate local fragment link
  try {
    const encoded = encodeRecipeToHash(recipe);
    const shareUrl = `${currentBaseUrl}#localReplay=${encoded}`;
    const isTooLargeForUrl = shareUrl.length > 2000;

    return {
      outcome: 'local',
      success: true,
      shareUrl,
      isCloudShared: false,
      isTooLargeForUrl,
    };
  } catch (err) {
    return {
      outcome: 'failure',
      success: false,
      shareUrl: '',
      isCloudShared: false,
      error: 'Failed to encode local replay data: ' + String(err),
    };
  }
}

/**
 * Loads a replay recipe by ID from AWS DynamoDB or from local URL fragment/parameter.
 */
export async function fetchReplay(replayId?: string): Promise<ReplayRecipe> {
  // 1. Check URL fragment for #localReplay= (new standard for client-only replays)
  if (typeof window !== 'undefined' && window.location.hash) {
    const hashStr = window.location.hash.slice(1); // remove '#'
    const hashParams = new URLSearchParams(hashStr);
    const localHash = hashParams.get('localReplay');
    if (localHash) {
      try {
        const recipe = decodeRecipeFromHash(localHash);
        const validation = validateReplayRecipe(recipe);
        if (!validation.valid) {
          throw new Error(`Invalid local recipe: ${validation.error}`);
        }
        return recipe;
      } catch (err) {
        throw new Error('Malformed local fragment replay data: ' + (err instanceof Error ? err.message : String(err)));
      }
    }
  }

  // 2. Check URL search query for ?localReplay= (legacy backward compatibility)
  if (typeof window !== 'undefined' && window.location.search) {
    const urlParams = new URLSearchParams(window.location.search);
    const localQuery = urlParams.get('localReplay');
    if (localQuery) {
      try {
        const recipe = decodeRecipeFromHash(localQuery);
        const validation = validateReplayRecipe(recipe);
        if (!validation.valid) {
          throw new Error(`Invalid local recipe: ${validation.error}`);
        }
        return recipe;
      } catch (err) {
        throw new Error('Malformed local search replay data: ' + (err instanceof Error ? err.message : String(err)));
      }
    }
  }

  // 3. Cloud Replay Fetch
  if (!replayId) {
    throw new Error('No replay identifier provided.');
  }

  if (!API_BASE_URL) {
    throw new Error('Cloud backend API is not configured on this frontend.');
  }

  const response = await fetch(`${API_BASE_URL}/replays/${encodeURIComponent(replayId)}`, {
    method: 'GET',
    headers: {
      Accept: 'application/json',
    },
  });

  if (response.status === 404) {
    throw new Error(`Replay with ID "${replayId}" was not found or has expired.`);
  }

  if (response.status === 410) {
    throw new Error(`Replay "${replayId}" has expired (retention period exceeded).`);
  }

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to load replay: HTTP ${response.status} - ${errorText}`);
  }

  const data = await response.json();
  const recipe: ReplayRecipe = {
    scenarioId: data.scenarioId,
    scenarioVersion: data.scenarioVersion,
    exerciseId: data.exerciseId,
    reviewerRows: data.reviewerRows || [],
    sql: data.sql || '',
    id: data.id,
    createdAt: data.createdAt,
    expiresAt: data.expiresAt,
  };

  const validation = validateReplayRecipe(recipe);
  if (!validation.valid) {
    throw new Error(`Remote replay recipe failed schema validation: ${validation.error}`);
  }

  return recipe;
}
