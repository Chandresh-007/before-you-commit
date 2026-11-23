import React from 'react';
import { Ticket, Target, Shield } from 'lucide-react';
import type { ReviewerExercise, Scenario } from '../types';
import { bookingTime } from './bookingDisplay';

interface TicketCardProps {
  scenario: Scenario;
  currentExercise?: ReviewerExercise;
  activeRole: 'developer' | 'reviewer';
  onRoleChange: (role: 'developer' | 'reviewer') => void;
}

export const TicketCard: React.FC<TicketCardProps> = ({
  scenario,
  currentExercise,
  activeRole,
  onRoleChange,
}) => {
  const targetRow = scenario.initialSeedRows.find(
    (r) => r.registration_id === scenario.targetRegistrationId
  );

  return (
    <div className="bg-surface border border-border rounded-xl overflow-hidden shadow-xs">
      {/* Role Tabs */}
      <div className="flex border-b border-border">
        <button
          type="button"
          aria-pressed={activeRole === 'developer'}
          onClick={() => onRoleChange('developer')}
          className={`flex-1 py-2 px-3 text-xs sm:text-sm font-semibold transition-colors cursor-pointer text-center ${
            activeRole === 'developer'
              ? 'text-teal-800 border-b-2 border-teal-600 bg-teal-50/70'
              : 'text-ink-muted hover:text-ink-secondary hover:bg-surface-alt'
          }`}
        >
          Developer (SQL Editor)
        </button>
        <button
          type="button"
          aria-pressed={activeRole === 'reviewer'}
          onClick={() => onRoleChange('reviewer')}
          className={`flex-1 py-2 px-3 text-xs sm:text-sm font-semibold transition-colors cursor-pointer text-center ${
            activeRole === 'reviewer'
              ? 'text-teal-800 border-b-2 border-teal-600 bg-teal-50/70'
              : 'text-ink-muted hover:text-ink-secondary hover:bg-surface-alt'
          }`}
        >
          Reviewer (Edge Cases)
        </button>
      </div>

      <div className="p-4 space-y-3">
        {/* Ticket ID + Subtitle */}
        <div className="flex flex-wrap gap-2 items-center justify-between">
          <span className="inline-flex items-center gap-1.5 font-mono text-xs font-bold text-teal-800 bg-teal-50 border border-teal-200 px-2 py-0.5 rounded">
            <Ticket className="w-3.5 h-3.5" /> {scenario.ticketId}
          </span>
          <span className="text-xs font-medium text-ink-muted">{scenario.subtitle}</span>
        </div>

        {/* Change Request Headline */}
        <h2 className="text-base sm:text-lg font-bold text-ink leading-snug m-0">
          {scenario.ticketDescription}
        </h2>

        {/* Structured Target & Preservation Scope */}
        <div className="bg-surface-alt border border-border rounded-lg p-3 space-y-2 text-xs">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5 font-semibold text-ink-secondary">
              <Target className="w-3.5 h-3.5 text-teal-600" />
              <span>Target Booking</span>
            </div>
            {targetRow && (
              <span className="font-mono text-[11px] text-ink-muted">
                {targetRow.student_id}
              </span>
            )}
          </div>

          {targetRow ? (
            <div className="bg-canvas border border-border rounded p-2 space-y-1">
              <div className="flex items-center justify-between">
                <span className="font-bold text-ink">{targetRow.student_name}</span>
                <span className="font-mono font-bold text-teal-800 bg-teal-50 px-1 rounded border border-teal-100">
                  #{targetRow.registration_id}
                </span>
              </div>
              <div className="text-ink-secondary text-[11px]">
                <strong>{targetRow.event_name}</strong> · {bookingTime(targetRow.session_date)}
              </div>
              <div className="text-[11px] font-medium text-ink pt-0.5">
                Transition:{' '}
                <span className="font-mono text-ink-muted">{targetRow.status}</span>{' '}
                <span className="text-teal-700">→</span>{' '}
                <span className="font-mono font-bold text-teal-800">{scenario.targetExpectedStatus}</span>
              </div>
            </div>
          ) : (
            <div className="font-mono">
              #{scenario.targetRegistrationId} → {scenario.targetExpectedStatus}
            </div>
          )}

          <div className="pt-1 border-t border-border/60">
            <div className="flex items-start gap-1.5 text-ink-secondary">
              <Shield className="w-3.5 h-3.5 text-teal-600 flex-shrink-0 mt-0.5" />
              <div>
                <span className="font-semibold text-ink">Must Preserve: </span>
                <span>{currentExercise?.scopeGuardDescription || scenario.targetCriteriaDescription}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
