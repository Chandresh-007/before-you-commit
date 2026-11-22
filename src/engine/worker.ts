import type { EngineWorkerRequest, EngineWorkerResponse } from '../types';
import { executeScenarioPreview } from './sqlEngine';

// Listen for messages from main thread
self.onmessage = async (event: MessageEvent<EngineWorkerRequest>) => {
  const { id, sql, scenario, reviewerRows } = event.data;

  try {
    const report = await executeScenarioPreview({
      scenario,
      reviewerRows,
      sql,
    });

    const response: EngineWorkerResponse = {
      id,
      success: true,
      report,
    };
    self.postMessage(response);
  } catch (err: unknown) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    const response: EngineWorkerResponse = {
      id,
      success: false,
      error: errorMessage,
    };
    self.postMessage(response);
  }
};
