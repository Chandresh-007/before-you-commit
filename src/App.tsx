import React, { useState, useEffect, useCallback, useRef } from 'react';
import { RotateCcw } from 'lucide-react';
import { Header } from './components/Header';
import { TicketCard } from './components/TicketCard';
import { SqlEditor } from './components/SqlEditor';
import { StatusBanner } from './components/StatusBanner';
import { DiffTable } from './components/DiffTable';
import { ReviewerSandbox } from './components/ReviewerSandbox';
import { ShareModal } from './components/ShareModal';
import { sqlWorkerManager } from './engine/workerClient';
import {
  SCENARIO_BANK,
  getScenarioById,
  resolveScenarioAndExercise,
} from './scenarios';
import { fetchReplay, saveReplay } from './api/replayApi';
import type { DiffReport, Registration, ReviewerExercise, Scenario } from './types';

export const App: React.FC = () => {
  // Active Scenario & Exercise State
  const [scenario, setScenario] = useState<Scenario>(SCENARIO_BANK[0]);
  const [currentExercise, setCurrentExercise] = useState<ReviewerExercise>(
    SCENARIO_BANK[0].exercises?.[0] || {
      id: 'default',
      name: 'Standard Ticket Scope Review',
      description: SCENARIO_BANK[0].ticketDescription,
      scopeGuardDescription: SCENARIO_BANK[0].targetCriteriaDescription,
      starterSql: SCENARIO_BANK[0].starterSql || '',
      solutionSql: SCENARIO_BANK[0].solutionSql || '',
      reviewerDefaultPreset:
        SCENARIO_BANK[0].reviewerDefaultPreset || SCENARIO_BANK[0].initialSeedRows[0],
      lessonExplanation: SCENARIO_BANK[0].lessonExplanation || '',
    }
  );

  // Core Editor & Reviewer State
  const [sql, setSql] = useState<string>(
    SCENARIO_BANK[0].exercises?.[0]?.starterSql || SCENARIO_BANK[0].starterSql || ''
  );
  const [reviewerRows, setReviewerRows] = useState<Registration[]>([]);
  const [report, setReport] = useState<DiffReport | null>(null);
  const [isRunning, setIsRunning] = useState<boolean>(false);
  const [executionError, setExecutionError] = useState<string | null>(null);
  const [loadingReplay, setLoadingReplay] = useState<boolean>(false);
  const [projectorMode, setProjectorMode] = useState<boolean>(false);
  const [activeRole, setActiveRole] = useState<'developer' | 'reviewer'>('developer');

  // Replay notice banner
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

  const runVersion = useRef(0);
  const [shareError, setShareError] = useState<string | null>(null);

  const editQuery = () => {
    setActiveRole('developer');
    requestAnimationFrame(() => {
      const editor = document.getElementById('candidate-sql');
      editor?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      editor?.focus();
    });
  };

  const openReviewer = () => {
    setActiveRole('reviewer');
    requestAnimationFrame(() => {
      const el = document.getElementById('reviewer-heading') || document.getElementById('reviewer-panel');
      el?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      el?.focus?.();
    });
  };

  // Core execution function
  const executeQuery = useCallback(
    async (targetScenario: Scenario, candidateSql: string, rows: Registration[]) => {
      const version = ++runVersion.current;
      setIsRunning(true);
      setExecutionError(null);

      try {
        const diffReport = await sqlWorkerManager.runQuery(targetScenario, candidateSql, rows);
        if (version === runVersion.current) setReport(diffReport);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        if (version !== runVersion.current) return;
        setExecutionError(msg);
        setReport(null);
      } finally {
        if (version === runVersion.current) setIsRunning(false);
      }
    },
    []
  );

  // Check URL params on initial mount to restore saved replay or load scenario
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const hashParams = new URLSearchParams(
      window.location.hash.startsWith('#') ? window.location.hash.slice(1) : window.location.hash
    );
    const replayId =
      urlParams.get('replay') || urlParams.get('localReplay') || hashParams.get('localReplay');
    const requestedScenarioId = urlParams.get('scenario');
    const requestedExerciseId = urlParams.get('exercise');

    ++runVersion.current;

    if (replayId) {
      setIsRunning(true);
      setLoadingReplay(true);
      fetchReplay(replayId)
        .then((recipe) => {
          // Resolve scenario and exercise with legacy fallback support
          const resolved = resolveScenarioAndExercise(recipe);
          setScenario(resolved.scenario);
          setCurrentExercise(resolved.exercise);
          setSql(recipe.sql);
          setReviewerRows(recipe.reviewerRows || []);
          setIsRestoredReplay(true);
          setReplayNotice(
            `Restored replay: ${resolved.scenario.title} · ${resolved.exercise.name} (${
              recipe.reviewerRows?.length || 0
            } edge-case row${(recipe.reviewerRows?.length || 0) !== 1 ? 's' : ''}).`
          );
          setLoadingReplay(false);
          // Run preview with restored data
          return executeQuery(resolved.scenario, recipe.sql, recipe.reviewerRows || []);
        })
        .catch((err) => {
          console.error('Failed to restore replay:', err);
          setExecutionError(`Failed to load replay: ${err.message}`);
          setReport(null);
        })
        .finally(() => {
          setLoadingReplay(false);
          setIsRunning(false);
        });
    } else if (requestedScenarioId) {
      const foundScenario = getScenarioById(requestedScenarioId);
      if (foundScenario) {
        setScenario(foundScenario);
        if (requestedExerciseId) {
          const foundEx = foundScenario.exercises?.find((e) => e.id === requestedExerciseId);
          if (foundEx) {
            setCurrentExercise(foundEx);
            setSql(foundEx.starterSql);
            setReport(null);
          } else {
            const available = foundScenario.exercises?.map((e) => e.id).join(', ') || 'default';
            setExecutionError(
              `Exercise "${requestedExerciseId}" was not found for scenario "${foundScenario.title}". Available exercises: ${available}.`
            );
            const defaultEx = foundScenario.exercises?.[0] || {
              id: 'default',
              name: 'Standard Ticket Scope Review',
              description: foundScenario.ticketDescription,
              scopeGuardDescription: foundScenario.targetCriteriaDescription,
              starterSql: foundScenario.starterSql || '',
              solutionSql: foundScenario.solutionSql || '',
              reviewerDefaultPreset:
                foundScenario.reviewerDefaultPreset || foundScenario.initialSeedRows[0],
              lessonExplanation: foundScenario.lessonExplanation || '',
            };
            setCurrentExercise(defaultEx);
            setSql(defaultEx.starterSql);
            setReport(null);
          }
        } else {
          const ex = foundScenario.exercises?.[0] || {
            id: 'default',
            name: 'Standard Ticket Scope Review',
            description: foundScenario.ticketDescription,
            scopeGuardDescription: foundScenario.targetCriteriaDescription,
            starterSql: foundScenario.starterSql || '',
            solutionSql: foundScenario.solutionSql || '',
            reviewerDefaultPreset:
              foundScenario.reviewerDefaultPreset || foundScenario.initialSeedRows[0],
            lessonExplanation: foundScenario.lessonExplanation || '',
          };
          setCurrentExercise(ex);
          setSql(ex.starterSql);
          setReport(null);
        }
      } else {
        setExecutionError(`Requested scenario "${requestedScenarioId}" was not found.`);
        setReport(null);
      }
    } else {
      setReport(null); // Deliberate ready-to-preview state for fresh challenge
    }
  }, [executeQuery]);

  // Handler: Switch Scenario
  const handleSelectScenario = (scenarioId: string) => {
    const nextScenario = getScenarioById(scenarioId);
    if (!nextScenario) return;

    const nextExercise = nextScenario.exercises?.[0] || {
      id: 'default',
      name: 'Standard Ticket Scope Review',
      description: nextScenario.ticketDescription,
      scopeGuardDescription: nextScenario.targetCriteriaDescription,
      starterSql: nextScenario.starterSql || '',
      solutionSql: nextScenario.solutionSql || '',
      reviewerDefaultPreset: nextScenario.reviewerDefaultPreset || nextScenario.initialSeedRows[0],
      lessonExplanation: nextScenario.lessonExplanation || '',
    };

    setScenario(nextScenario);
    setCurrentExercise(nextExercise);
    setSql(nextExercise.starterSql);
    setReviewerRows([]);
    setExecutionError(null);
    setIsRestoredReplay(false);
    setReplayNotice(null);

    // Update URL query params and clear obsolete replay/hash state
    const url = new URL(window.location.href);
    url.searchParams.set('scenario', nextScenario.id);
    url.searchParams.delete('replay');
    url.searchParams.delete('localReplay');
    url.hash = '';
    if (nextExercise.id !== 'default') {
      url.searchParams.set('exercise', nextExercise.id);
    } else {
      url.searchParams.delete('exercise');
    }
    window.history.replaceState({}, '', url.toString());

    ++runVersion.current;
    setActiveRole('developer');
    setReport(null);
  };

  // Handler: Switch Exercise within active Scenario
  const handleSelectExercise = (exerciseId: string) => {
    const nextEx = scenario.exercises?.find((e) => e.id === exerciseId);
    if (!nextEx) return;

    setCurrentExercise(nextEx);
    setSql(nextEx.starterSql);
    setReviewerRows([]);
    setExecutionError(null);

    // Update URL query param and clear obsolete replay/hash state
    const url = new URL(window.location.href);
    url.searchParams.set('scenario', scenario.id);
    url.searchParams.set('exercise', nextEx.id);
    url.searchParams.delete('replay');
    url.searchParams.delete('localReplay');
    url.hash = '';
    window.history.replaceState({}, '', url.toString());

    ++runVersion.current;
    setIsRestoredReplay(false);
    setReplayNotice(null);
    setActiveRole('developer');
    setReport(null);
  };

  // Handler: Add reviewer preset row
  const handleAddDefaultPreset = () => {
    const preset =
      currentExercise.reviewerDefaultPreset ||
      scenario.reviewerDefaultPreset ||
      scenario.initialSeedRows[0];

    if (reviewerRows.some((r) => r.registration_id === preset.registration_id)) {
      return;
    }
    const updated: Registration[] = [...reviewerRows, { ...preset, reviewerSource: 'supplied' }];
    setReviewerRows(updated);
    setActiveRole('reviewer');
    // Immediately re-run candidate SQL to show the regression while preserving student's SQL!
    executeQuery(scenario, sql, updated);
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
        error: `Registration ID #${row.registration_id} has already been added as an edge-case row.`,
      };
    }

    const updated: Registration[] = [...reviewerRows, { ...row, reviewerSource: 'custom' }];
    setReviewerRows(updated);
    setActiveRole('reviewer');
    executeQuery(scenario, sql, updated);
    return { success: true };
  };

  // Handler: Remove reviewer row
  const handleRemoveReviewerRow = (registrationId: number) => {
    const updated = reviewerRows.filter((r) => r.registration_id !== registrationId);
    setReviewerRows(updated);
    executeQuery(scenario, sql, updated);
  };

  // Handler: Clear all reviewer rows
  const handleClearAllReviewerRows = () => {
    setReviewerRows([]);
    executeQuery(scenario, sql, []);
  };

  // Handler: Reset all state (Start over)
  const handleResetAll = () => {
    setSql(currentExercise.starterSql);
    setReviewerRows([]);
    setExecutionError(null);
    setIsRestoredReplay(false);
    setReplayNotice(null);
    setActiveRole('developer');

    // Keep reset on its own challenge
    const url = new URL(window.location.href);
    url.searchParams.set('scenario', scenario.id);
    url.searchParams.set('exercise', currentExercise.id);
    url.searchParams.delete('replay');
    url.searchParams.delete('localReplay');
    url.hash = '';
    window.history.replaceState({}, '', url.toString());

    ++runVersion.current;
    setIsRunning(false);
    setReport(null);
  };

  // Handler: Share replay
  const handleShare = async () => {
    setIsSharing(true);
    setShareError(null);
    try {
      const shareResult = await saveReplay({
        scenarioId: scenario.id,
        scenarioVersion: scenario.version,
        exerciseId: currentExercise.id,
        reviewerRows,
        sql,
      });

      setShareModalState({
        isOpen: true,
        shareUrl: shareResult.shareUrl,
        isCloudShared: shareResult.isCloudShared,
        cloudError: shareResult.error,
      });
    } catch (err) {
      setShareError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsSharing(false);
    }
  };

  if (loadingReplay) {
    return (
      <main className="loading-replay" role="status">
        <h1>QueryScope</h1>
        <p>Restoring your challenge and replay…</p>
      </main>
    );
  }

  const isSqlStale = !!report && report.sql !== sql;

  return (
    <div
      className={
        'min-h-screen flex flex-col bg-canvas text-ink antialiased' +
        (projectorMode ? ' projector-mode' : '')
      }
    >
      {/* Header */}
      <Header
        scenarios={SCENARIO_BANK}
        activeScenario={scenario}
        onSelectScenario={handleSelectScenario}
        activeExercise={currentExercise}
        onSelectExercise={handleSelectExercise}
        projectorMode={projectorMode}
        onToggleProjectorMode={() => setProjectorMode(!projectorMode)}
        onReset={handleResetAll}
        onShare={handleShare}
        isSharing={isSharing}
      />

      {/* Main Workspace */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 py-4 sm:py-6 space-y-4">
        {/* Replay Notice */}
        {isRestoredReplay && replayNotice && (
          <div className="bg-teal-50 border border-teal-200 rounded-xl px-4 py-3 flex items-center justify-between gap-3 text-xs text-teal-800">
            <span>{replayNotice}</span>
            <button
              type="button"
              onClick={handleResetAll}
              className="text-teal-700 hover:text-teal-900 font-medium flex items-center gap-1 cursor-pointer whitespace-nowrap"
            >
              <RotateCcw className="w-3 h-3" />
              <span>Reset</span>
            </button>
          </div>
        )}

        {shareError && (
          <p role="alert" className="result-banner result-warning">
            Unable to share: {shareError}
          </p>
        )}

        <div className="workspace-grid">
          {/* Authoring & Query Section */}
          <div className="workspace-author">
            <TicketCard
              scenario={scenario}
              currentExercise={currentExercise}
              activeRole={activeRole}
              onRoleChange={(role) => (role === 'reviewer' ? openReviewer() : setActiveRole(role))}
            />

            <SqlEditor
              sql={sql}
              onChange={setSql}
              onRunPreview={() => executeQuery(scenario, sql, reviewerRows)}
              onResetSql={() => {
                setSql(currentExercise.starterSql);
              }}
              onApplySolution={() => {
                setSql(currentExercise.solutionSql);
              }}
              isRunning={isRunning}
              projectorMode={projectorMode}
              activeRole={activeRole}
            />
          </div>

          {/* Evidence & Diff Section */}
          <div className="workspace-evidence" id="review-results">
            <div aria-live="polite" aria-atomic="true" className="sr-only">
              {isRunning ? 'Previewing query' : executionError || report?.summary.headline}
            </div>
            <StatusBanner
              report={report}
              error={executionError}
              scenario={scenario}
              projectorMode={projectorMode}
              reviewerRowsCount={reviewerRows.length}
              onTestAnotherBooking={openReviewer}
              onEditQuery={editQuery}
              onStartFresh={handleResetAll}
              isStale={isSqlStale}
            />
            <DiffTable
              report={report}
              scenario={scenario}
              currentExercise={currentExercise}
              reviewerRowsCount={reviewerRows.length}
              reviewerRows={reviewerRows}
              projectorMode={projectorMode}
            />
          </div>

          {/* Reviewer Sandbox Section */}
          <div className="workspace-reviewer">
            <ReviewerSandbox
              key={scenario.id + currentExercise.id}
              scenario={scenario}
              currentExercise={currentExercise}
              reviewerRows={reviewerRows}
              onAddPreset={handleAddDefaultPreset}
              onAddCustomRow={handleAddCustomRow}
              onRemoveRow={handleRemoveReviewerRow}
              onClearAll={handleClearAllReviewerRows}
            />
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-border bg-surface px-4 py-3 text-center text-xs text-ink-muted">
        <div className="max-w-7xl mx-auto">
          <strong className="text-ink-secondary">QueryScope</strong> · Preview. Challenge. Refine.
        </div>
      </footer>

      {/* Share Modal */}
      <ShareModal
        isOpen={shareModalState.isOpen}
        onClose={() => setShareModalState((prev) => ({ ...prev, isOpen: false }))}
        shareUrl={shareModalState.shareUrl}
        isCloudShared={shareModalState.isCloudShared}
        cloudError={shareModalState.cloudError}
        isSqlStale={isSqlStale}
      />
    </div>
  );
};

export default App;
