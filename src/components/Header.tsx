import React from 'react';
import { Share2, ChevronDown, RotateCcw, Loader2, Monitor } from 'lucide-react';
import type { ReviewerExercise, Scenario } from '../types';

interface HeaderProps {
  scenarios: Scenario[];
  activeScenario: Scenario;
  onSelectScenario: (scenarioId: string) => void;
  activeExercise?: ReviewerExercise;
  onSelectExercise: (exerciseId: string) => void;
  onReset: () => void;
  onShare: () => void;
  isSharing: boolean;
  projectorMode: boolean;
  onToggleProjectorMode: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  scenarios,
  activeScenario,
  onSelectScenario,
  activeExercise,
  onSelectExercise,
  onReset,
  onShare,
  isSharing,
  projectorMode,
  onToggleProjectorMode,
}) => {
  return (
    <header className="app-header bg-surface border-b border-border sticky top-0 z-30 shadow-xs">
      <div className="header-inner max-w-7xl mx-auto px-4 sm:px-6 py-2.5 flex items-center justify-between gap-3">
        {/* Brand + Challenge Switcher */}
        <div className="header-challenges flex items-center gap-3 min-w-0">
          <div className="flex items-center gap-2">
            <h1 className="text-sm sm:text-base font-bold text-ink tracking-tight whitespace-nowrap m-0">
              QueryScope
            </h1>
            <span className="hidden md:inline text-xs text-ink-muted border-l border-border pl-2 font-medium">
              Preview an SQL update and see which bookings it changes.
            </span>
          </div>

          {/* Challenge Selector */}
          <div className="relative min-w-0">
            <select
              value={activeScenario.id}
              onChange={(e) => onSelectScenario(e.target.value)}
              className="appearance-none bg-surface-alt border border-border rounded-lg pl-3 pr-7 py-1 text-xs sm:text-sm font-medium text-ink cursor-pointer focus:outline-none focus:ring-2 focus:ring-teal-600 min-w-0 max-w-[170px] sm:max-w-xs truncate"
              aria-label="Switch challenge"
              title="Switch challenge"
            >
              {scenarios.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.id === 'scenario-cloud-quest-ananya' ? 'Cloud Quest · Ananya' : s.title}
                </option>
              ))}
            </select>
            <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-ink-muted pointer-events-none" />
          </div>

          {/* Exercise Selector (for multi-exercise scenarios) */}
          {activeScenario.exercises && activeScenario.exercises.length > 1 && (
            <div className="relative exercise-select min-w-0">
              <select
                value={activeExercise?.id}
                onChange={(e) => onSelectExercise(e.target.value)}
                className="appearance-none bg-surface-alt border border-border rounded-lg pl-3 pr-7 py-1 text-xs font-medium text-ink cursor-pointer focus:outline-none focus:ring-2 focus:ring-teal-600 max-w-[190px] truncate"
                aria-label="Select exercise"
                title="Select exercise"
              >
                {activeScenario.exercises.map((ex) => (
                  <option key={ex.id} value={ex.id}>
                    {ex.name}
                  </option>
                ))}
              </select>
              <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-ink-muted pointer-events-none" />
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="header-actions flex items-center gap-2 flex-shrink-0">
          <button
            type="button"
            className={`text-button text-xs py-1 px-2 rounded font-medium flex items-center gap-1 transition-colors cursor-pointer ${
              projectorMode ? 'bg-teal-700 text-white' : 'text-ink-secondary hover:text-ink hover:bg-surface-alt'
            }`}
            aria-pressed={projectorMode}
            onClick={onToggleProjectorMode}
            title="Toggle projector high-contrast mode"
          >
            <Monitor size={14} />
            <span className="hidden sm:inline">Projector</span>
          </button>

          <button
            type="button"
            onClick={onReset}
            className="p-1 sm:px-2.5 sm:py-1 text-xs font-medium text-ink-secondary hover:text-ink hover:bg-surface-alt rounded-lg transition-colors flex items-center gap-1 cursor-pointer border border-transparent hover:border-border"
            aria-label="Start exercise over"
            title="Start exercise over (resets query and clears edge cases)"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Start over</span>
          </button>

          <button
            type="button"
            onClick={onShare}
            disabled={isSharing}
            className="px-3 py-1 text-xs sm:text-sm font-semibold rounded-lg bg-teal-600 hover:bg-teal-700 text-white transition-colors flex items-center gap-1.5 cursor-pointer disabled:opacity-50 shadow-sm"
            title="Share this replay"
          >
            {isSharing ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Share2 className="w-3.5 h-3.5" />
            )}
            <span>Share replay</span>
          </button>
        </div>
      </div>
    </header>
  );
};
