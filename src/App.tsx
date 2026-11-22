import React, { useState, useEffect, useCallback } from 'react';
import { CLOUD_QUEST_SCENARIO } from './scenarios/cloudQuest';
import { sqlWorkerManager } from './engine/workerClient';
import type { DiffReport, Registration } from './types';
import { Header } from './components/Header';
import { TicketCard } from './components/TicketCard';
import { SqlEditor } from './components/SqlEditor';
import { ReviewerSandbox } from './components/ReviewerSandbox';
import { StatusBanner } from './components/StatusBanner';
import { DiffTable } from './components/DiffTable';
import { ShareModal } from './components/ShareModal';
import { saveReplay, fetchReplay } from './api/replayApi';
import { CheckCircle2, RotateCcw } from 'lucide-react';

export const App: React.FC = () => {
  const scenario = CLOUD_QUEST_SCENARIO;

  const [activeRole, setActiveRole] = useState<'developer' | 'reviewer'>('developer');
  const [sql, setSql] = useState<string>(scenario.starterSql);
  const [reviewerRows, setReviewerRows] = useState<Registration[]>([]);
  const [report, setReport] = useState<DiffReport | null>(null);
  const [executionError, setExecutionError] = useState<string | null>(null);
  const [isRunning, setIsRunning] = useState<boolean>(false);
  const [projectorMode, setProjectorMode] = useState<boolean>(false);

  // Replay load status
  const [isRestoredReplay, setIsRestoredReplay] = useState<boolean>(false);
  const [replayNotice, setReplayNotice] = useState<string | null>(null);

  // Share modal state
  const [isSharing, setIsSharing] = useState<boolean>(false);
  const [shareModalState, setShareModalState] = useState<{
    isOpen: boolean;
    shareUrl: string;
    isCloudShared: boolean;
    cloudError?: string;
  }>({
    isOpen: false,
    shareUrl: '',
    isCloudShared: false,
  });

  // Core execution function
  const executeQuery = useCallback(
    async (candidateSql: string, rows: Registration[]) => {
      setIsRunning(true);
      setExecutionError(null);

      try {
        const diffReport = await sqlWorkerManager.runQuery(scenario, candidateSql, rows);
        setReport(diffReport);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        setExecutionError(msg);
        setReport(null);
      } finally {
        setIsRunning(false);
      }
    },
    [scenario]
  );

  // Check URL params on initial mount to restore saved replay
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const replayId = urlParams.get('replay') || urlParams.get('localReplay');

    if (replayId) {
      setIsRunning(true);
      fetchReplay(replayId)
        .then((recipe) => {
          setSql(recipe.sql);
          setReviewerRows(recipe.reviewerRows || []);
          setIsRestoredReplay(true);
          setReplayNotice(
            `Restored shared replay: Loaded candidate query and ${
              recipe.reviewerRows?.length || 0
            } reviewer edge-case row(s).`
          );
          // Run preview with restored data
          return executeQuery(recipe.sql, recipe.reviewerRows || []);
        })
        .catch((err) => {
          console.error('Failed to restore replay:', err);
          setExecutionError(`Failed to load replay: ${err.message}`);
          // Fall back to starter run
          executeQuery(scenario.starterSql, []);
        })
        .finally(() => {
          setIsRunning(false);
        });
    } else {
      // Normal starter preview
      executeQuery(scenario.starterSql, []);
    }
  }, [scenario, executeQuery]);

  // Handler: Add October attendance preset (#87)
  const handleAddOctoberPreset = () => {
    if (reviewerRows.some((r) => r.registration_id === scenario.reviewerDefaultPreset.registration_id)) {
      return;
    }
    const updated = [...reviewerRows, scenario.reviewerDefaultPreset];
    setReviewerRows(updated);
    // Immediately re-run unchanged candidate SQL to visually show the regression!
    executeQuery(sql, updated);
  };

  // Handler: Add custom reviewer row
  const handleAddCustomRow = (row: Registration) => {
    // Check against seed IDs
    const existsInSeed = scenario.initialSeedRows.some(
      (r) => r.registration_id === row.registration_id
    );
    if (existsInSeed) {
      return {
        success: false,
        error: `Registration ID #${row.registration_id} already exists in the starter database. Primary keys must be unique.`,
      };
    }

    // Check against existing reviewer rows
    const existsInReviewer = reviewerRows.some(
      (r) => r.registration_id === row.registration_id
    );
    if (existsInReviewer) {
      return {
        success: false,
        error: `Registration ID #${row.registration_id} was already added. Please choose another ID.`,
      };
    }

    const updated = [...reviewerRows, row];
    setReviewerRows(updated);
    executeQuery(sql, updated);
    return { success: true };
  };

  // Handler: Remove reviewer row
  const handleRemoveReviewerRow = (registrationId: number) => {
    const updated = reviewerRows.filter((r) => r.registration_id !== registrationId);
    setReviewerRows(updated);
    executeQuery(sql, updated);
  };

  // Handler: Clear all reviewer rows
  const handleClearAllReviewerRows = () => {
    setReviewerRows([]);
    executeQuery(sql, []);
  };

  // Handler: Reset all state
  const handleResetAll = () => {
    setSql(scenario.starterSql);
    setReviewerRows([]);
    setExecutionError(null);
    setIsRestoredReplay(false);
    setReplayNotice(null);
    setActiveRole('developer');
    // Clear URL query params cleanly without reloading
    window.history.replaceState({}, document.title, window.location.pathname);
    executeQuery(scenario.starterSql, []);
  };

  // Handler: Share replay
  const handleShare = async () => {
    setIsSharing(true);
    try {
      const shareResult = await saveReplay({
        scenarioVersion: scenario.version,
        reviewerRows,
        sql,
      });

      setShareModalState({
        isOpen: true,
        shareUrl: shareResult.shareUrl,
        isCloudShared: shareResult.isCloudShared,
        cloudError: shareResult.error,
      });
    } finally {
      setIsSharing(false);
    }
  };

  return (
    <div
      className={`min-h-screen flex flex-col bg-slate-950 text-slate-100 ${
        projectorMode ? 'text-base font-medium' : 'text-sm'
      }`}
    >
      {/* Top Classroom Bar */}
      <Header
        scenarioTitle={scenario.title}
        projectorMode={projectorMode}
        onToggleProjectorMode={() => setProjectorMode(!projectorMode)}
        onReset={handleResetAll}
        onShare={handleShare}
        isSharing={isSharing}
      />

      {/* Main Container */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 space-y-5">
        {/* Replay Notice (if loaded from link) */}
        {isRestoredReplay && replayNotice && (
          <div className="bg-indigo-950/60 border border-indigo-700/80 rounded-xl p-3.5 flex items-center justify-between gap-3 text-xs text-indigo-200 shadow-md">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />
              <span>{replayNotice}</span>
            </div>
            <button
              type="button"
              onClick={handleResetAll}
              className="text-indigo-300 hover:text-white underline font-semibold flex-shrink-0 flex items-center gap-1 cursor-pointer"
            >
              <RotateCcw className="w-3 h-3" />
              <span>Reset to default</span>
            </button>
          </div>
        )}

        {/* Status Headline Banner (Projector Optimized) */}
        <StatusBanner
          report={report}
          error={executionError}
          projectorMode={projectorMode}
        />

        {/* Core Workspace Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
          {/* Left Column: Ticket Specification & SQL Editor */}
          <div className="lg:col-span-5 space-y-5">
            <TicketCard
              scenario={scenario}
              activeRole={activeRole}
              onRoleChange={setActiveRole}
            />

            <SqlEditor
              sql={sql}
              onChange={setSql}
              onRunPreview={() => executeQuery(sql, reviewerRows)}
              onResetSql={() => {
                setSql(scenario.starterSql);
                executeQuery(scenario.starterSql, reviewerRows);
              }}
              onApplySolution={() => {
                setSql(scenario.solutionSql);
                executeQuery(scenario.solutionSql, reviewerRows);
              }}
              isRunning={isRunning}
              projectorMode={projectorMode}
            />
          </div>

          {/* Right Column: Reviewer Sandbox & Live Row Diff Table */}
          <div className="lg:col-span-7 space-y-5">
            <ReviewerSandbox
              scenario={scenario}
              reviewerRows={reviewerRows}
              onAddPreset={handleAddOctoberPreset}
              onAddCustomRow={handleAddCustomRow}
              onRemoveRow={handleRemoveReviewerRow}
              onClearAll={handleClearAllReviewerRows}
            />

            <DiffTable report={report} projectorMode={projectorMode} />
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-900 bg-slate-950/80 px-4 py-4 text-center text-xs text-slate-500">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-2">
          <div>
            <strong>Before You Commit</strong> · College DBMS Change Review & Verification Environment
          </div>
          <div className="flex items-center gap-3 text-slate-400">
            <span>In-Browser SQLite WASM</span>
            <span>·</span>
            <span>Zero Server State for Execution</span>
            <span>·</span>
            <span>AWS SAM Sharing</span>
          </div>
        </div>
      </footer>

      {/* Share Modal Dialog */}
      <ShareModal
        isOpen={shareModalState.isOpen}
        onClose={() => setShareModalState((prev) => ({ ...prev, isOpen: false }))}
        shareUrl={shareModalState.shareUrl}
        isCloudShared={shareModalState.isCloudShared}
        cloudError={shareModalState.cloudError}
      />
    </div>
  );
};

export default App;
