import type { DiffReport, EngineWorkerRequest, EngineWorkerResponse, Registration, Scenario } from '../types';
import { executeScenarioPreview } from './sqlEngine';

const WORKER_TIMEOUT_MS = 2500;

class SqlWorkerManager {
  private worker: Worker | null = null;
  private pendingRequests = new Map<
    string,
    {
      resolve: (report: DiffReport) => void;
      reject: (error: Error) => void;
      timer: ReturnType<typeof setTimeout>;
    }
  >();

  private getWorker(): Worker | null {
    if (typeof Worker === 'undefined') {
      // In SSR or test environments where Worker isn't globally available
      return null;
    }

    if (!this.worker) {
      try {
        this.worker = new Worker(new URL('./worker.ts', import.meta.url), {
          type: 'module',
        });

        this.worker.onmessage = (event: MessageEvent<EngineWorkerResponse>) => {
          const { id, success, report, error } = event.data;
          const pending = this.pendingRequests.get(id);
          if (!pending) return;

          clearTimeout(pending.timer);
          this.pendingRequests.delete(id);

          if (success && report) {
            pending.resolve(report);
          } else {
            pending.reject(new Error(error || 'SQL execution failed in worker.'));
          }
        };

        this.worker.onerror = (err) => {
          console.error('Worker error:', err);
          this.restartWorker();
        };
      } catch (e) {
        console.warn('Failed to initialize Web Worker, falling back to main-thread execution:', e);
        this.worker = null;
      }
    }
    return this.worker;
  }

  public restartWorker(): void {
    if (this.worker) {
      this.worker.terminate();
      this.worker = null;
    }
    // Reject any pending requests
    for (const [id, pending] of this.pendingRequests.entries()) {
      clearTimeout(pending.timer);
      pending.reject(new Error('SQL worker terminated or timed out. State has been reset cleanly.'));
      this.pendingRequests.delete(id);
    }
  }

  public async runQuery(
    scenario: Scenario,
    sql: string,
    reviewerRows: Registration[] = []
  ): Promise<DiffReport> {
    const worker = this.getWorker();

    // If running in environment without Web Worker, execute in-process
    if (!worker) {
      return executeScenarioPreview({
        scenario,
        reviewerRows,
        sql,
      });
    }

    const requestId = `req_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

    return new Promise<DiffReport>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pendingRequests.delete(requestId);
        this.restartWorker();
        reject(
          new Error(
            `Execution timed out (exceeded ${WORKER_TIMEOUT_MS}ms). Query execution was halted and the worker was cleanly recovered.`
          )
        );
      }, WORKER_TIMEOUT_MS);

      this.pendingRequests.set(requestId, { resolve, reject, timer });

      const request: EngineWorkerRequest = {
        id: requestId,
        sql,
        scenario,
        reviewerRows,
      };

      worker.postMessage(request);
    });
  }
}

export const sqlWorkerManager = new SqlWorkerManager();
