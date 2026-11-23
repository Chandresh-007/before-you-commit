import { afterEach, describe, expect, it, vi } from 'vitest';
import { saveReplay, fetchReplay, encodeRecipeToHash, decodeRecipeFromHash } from '../src/api/replayApi';

const recipe = {
  scenarioId: 'example',
  scenarioVersion: '1.0.0',
  reviewerRows: [
    {
      registration_id: 188,
      student_id: 'STU-404',
      student_name: 'आरव पटेल (Aarav Patel)',
      event_name: 'Facebook Interview > Panel ?~',
      session_date: '2024-11-25 14:00',
      status: 'scheduled',
    },
  ],
  sql: "UPDATE registrations SET status = 'cancelled' WHERE student_name = 'आरव' AND note = '?>>++';\n-- Unicode comment: छात्र समीक्षा",
};

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe('Self-contained replay fallback', () => {
  it('round trips Unicode when cloud saving fails using URL fragment', async () => {
    vi.stubEnv('VITE_API_URL', 'https://example.invalid');
    const mockLocation = { origin: 'http://localhost', pathname: '/', search: '', hash: '' };
    vi.stubGlobal('window', { location: mockLocation });
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Offline')));

    const saved = await saveReplay(recipe);
    expect(saved.isCloudShared).toBe(false);
    expect(saved.outcome).toBe('local');
    expect(saved.shareUrl).toContain('localReplay=');

    const parsedUrl = new URL(saved.shareUrl);
    mockLocation.hash = parsedUrl.hash;
    mockLocation.search = parsedUrl.search;

    const restored = await fetchReplay('unused');
    expect(restored.sql).toBe(recipe.sql);
    expect(restored.reviewerRows[0].student_name).toBe(recipe.reviewerRows[0].student_name);
  });

  it('guarantees URL-safe encoding without plus sign that URLSearchParams interprets as space', () => {
    const encoded = encodeRecipeToHash(recipe);
    // URL-safe Base64 must NOT contain standard '+' or '/' characters
    expect(encoded).not.toContain('+');
    expect(encoded).not.toContain('/');
    expect(encoded).not.toContain('=');

    // Simulate URLSearchParams roundtrip over fragment
    const hashString = `localReplay=${encoded}`;
    const params = new URLSearchParams(hashString);
    const retrieved = params.get('localReplay')!;

    // Retrieved string must equal encoded without corruption
    expect(retrieved).toBe(encoded);

    const decoded = decodeRecipeFromHash(retrieved);
    expect(decoded.sql).toBe(recipe.sql);
    expect(decoded.reviewerRows[0].event_name).toBe(recipe.reviewerRows[0].event_name);
  });

  it('recovers legacy fragments where URLSearchParams converted plus signs to spaces', () => {
    // If a previous link had standard base64 with '+', URLSearchParams turned it into ' '
    const bytes = new TextEncoder().encode(JSON.stringify(recipe));
    let binary = '';
    for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
    const legacyStr = btoa(binary);

    const corruptedByUrlSearchParams = legacyStr.replace(/\+/g, ' ');
    const decoded = decodeRecipeFromHash(corruptedByUrlSearchParams);
    expect(decoded.sql).toBe(recipe.sql);
  });

  it('still opens legacy ASCII self-contained links in search query', async () => {
    const old = {
      scenarioId: 'example',
      scenarioVersion: '1.0.0',
      reviewerRows: [],
      sql: "UPDATE registrations SET status = 'cancelled' WHERE registration_id = 204;",
    };
    vi.stubGlobal('window', {
      location: {
        origin: 'http://localhost',
        pathname: '/',
        hash: '',
        search: '?localReplay=' + encodeURIComponent(btoa(JSON.stringify(old))),
      },
    });
    expect((await fetchReplay('unused')).sql).toBe(old.sql);
  });

  it('rejects cloud save failure (HTTP 400) without presenting application homepage as share URL', async () => {
    vi.stubEnv('VITE_API_URL', 'https://example.invalid');
    const mockLocation = { origin: 'http://localhost', pathname: '/', search: '', hash: '' };
    vi.stubGlobal('window', { location: mockLocation });
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 400,
        json: async () => ({ error: 'Payload validation rejected by cloud schema.' }),
      })
    );

    const result = await saveReplay(recipe);
    expect(result.outcome).toBe('failure');
    expect(result.success).toBe(false);
    expect(result.shareUrl).toBe(''); // MUST NOT be http://localhost/ (homepage)!
    expect(result.error).toContain('Payload validation rejected');
  });

  it('rejects malformed cloud success response that lacks a valid 12-char hex replay ID', async () => {
    vi.stubEnv('VITE_API_URL', 'https://example.invalid');
    const mockLocation = { origin: 'http://localhost', pathname: '/', search: '', hash: '' };
    vi.stubGlobal('window', { location: mockLocation });
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ message: 'ok', id: 'invalid-non-hex-id' }), // Invalid ID!
      })
    );

    const result = await saveReplay(recipe);
    // Falls back safely to local self-contained link
    expect(result.outcome).toBe('local');
    expect(result.isCloudShared).toBe(false);
    expect(result.shareUrl).toContain('#localReplay=');
    expect(result.error).toContain('missing valid 12-character hexadecimal replay ID');
  });
});
