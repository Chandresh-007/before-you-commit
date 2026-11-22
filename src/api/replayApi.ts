import type { ReplayRecipe } from '../types';

// The backend API URL can be injected via Vite env or defaults to current origin / custom endpoint
const API_BASE_URL = import.meta.env.VITE_API_URL || '';

export interface ShareResult {
  success: boolean;
  replayId?: string;
  shareUrl: string;
  isCloudShared: boolean;
  error?: string;
}

/**
 * Saves a replay recipe to AWS DynamoDB via API Gateway HTTP API.
 * If backend is unavailable or unconfigured, falls back to URL fragment/hash encoding
 * while explicitly informing the user of the exact cloud status.
 */
export async function saveReplay(recipe: ReplayRecipe): Promise<ShareResult> {
  const currentBaseUrl = window.location.origin + window.location.pathname;

  if (API_BASE_URL) {
    try {
      const response = await fetch(`${API_BASE_URL}/replays`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          scenarioVersion: recipe.scenarioVersion,
          reviewerRows: recipe.reviewerRows,
          sql: recipe.sql,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`AWS API Gateway returned ${response.status}: ${errorText}`);
      }

      const data = await response.json();
      const replayId = data.id || data.replayId;
      const shareUrl = `${currentBaseUrl}?replay=${replayId}`;

      return {
        success: true,
        replayId,
        shareUrl,
        isCloudShared: true,
      };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      console.warn('Cloud replay saving failed, providing local hash URL:', message);

      // Encode locally into URL param as reliable fallback
      const encoded = encodeURIComponent(btoa(JSON.stringify(recipe)));
      const shareUrl = `${currentBaseUrl}?localReplay=${encoded}`;

      return {
        success: false,
        shareUrl,
        isCloudShared: false,
        error: message,
      };
    }
  }

  // If no cloud API configured yet, generate local hash link
  try {
    const encoded = encodeURIComponent(btoa(JSON.stringify(recipe)));
    const shareUrl = `${currentBaseUrl}?localReplay=${encoded}`;
    return {
      success: true,
      shareUrl,
      isCloudShared: false,
    };
  } catch (err) {
    return {
      success: false,
      shareUrl: currentBaseUrl,
      isCloudShared: false,
      error: 'Failed to encode local replay data: ' + String(err),
    };
  }
}

/**
 * Loads a replay recipe by ID from AWS DynamoDB or from local URL parameter.
 */
export async function fetchReplay(replayId: string): Promise<ReplayRecipe> {
  // Check if it's a local encoded replay
  const urlParams = new URLSearchParams(window.location.search);
  const localReplayData = urlParams.get('localReplay');
  if (localReplayData) {
    try {
      const decodedJson = atob(decodeURIComponent(localReplayData));
      return JSON.parse(decodedJson) as ReplayRecipe;
    } catch (err) {
      throw new Error('Malformed local replay data: ' + String(err));
    }
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
    throw new Error(`Replay "${replayId}" has expired.`);
  }

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to load replay: HTTP ${response.status} - ${errorText}`);
  }

  const data = await response.json();
  return {
    scenarioVersion: data.scenarioVersion,
    reviewerRows: data.reviewerRows || [],
    sql: data.sql || '',
    id: data.id,
    createdAt: data.createdAt,
    expiresAt: data.expiresAt,
  };
}
