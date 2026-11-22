import React from 'react';
import { Ticket, Target, AlertCircle, User, ShieldAlert } from 'lucide-react';
import type { Scenario } from '../types';

interface TicketCardProps {
  scenario: Scenario;
  activeRole: 'developer' | 'reviewer';
  onRoleChange: (role: 'developer' | 'reviewer') => void;
}

export const TicketCard: React.FC<TicketCardProps> = ({
  scenario,
  activeRole,
  onRoleChange,
}) => {
  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-lg">
      {/* Role Switcher Tab */}
      <div className="flex border-b border-slate-800 bg-slate-950/60 p-1">
        <button
          type="button"
          onClick={() => onRoleChange('developer')}
          className={`flex-1 py-2 px-3 text-xs font-semibold rounded-lg flex items-center justify-center gap-2 transition-all cursor-pointer ${
            activeRole === 'developer'
              ? 'bg-indigo-600/20 text-indigo-300 border border-indigo-500/40 shadow'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <User className="w-3.5 h-3.5" />
          <span>Developer Role (Writes SQL)</span>
        </button>
        <button
          type="button"
          onClick={() => onRoleChange('reviewer')}
          className={`flex-1 py-2 px-3 text-xs font-semibold rounded-lg flex items-center justify-center gap-2 transition-all cursor-pointer ${
            activeRole === 'reviewer'
              ? 'bg-amber-600/20 text-amber-300 border border-amber-500/40 shadow'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <ShieldAlert className="w-3.5 h-3.5" />
          <span>Reviewer Role (Adds Edge Cases)</span>
        </button>
      </div>

      <div className="p-4 sm:p-5 space-y-3">
        {/* Ticket Header */}
        <div className="flex items-center justify-between text-xs">
          <span className="flex items-center gap-1.5 font-mono font-bold text-indigo-400 bg-indigo-950/60 border border-indigo-800 px-2 py-0.5 rounded">
            <Ticket className="w-3 h-3" /> {scenario.ticketId}
          </span>
          <span className="text-slate-400 font-medium">Cloud Quest Registration Portal</span>
        </div>

        {/* Change Request Title */}
        <div className="space-y-1">
          <h2 className="text-base sm:text-lg font-bold text-white tracking-tight m-0">
            {scenario.ticketDescription}
          </h2>
        </div>

        {/* Acceptance Scope Criteria */}
        <div className="bg-slate-950/80 border border-slate-800/90 rounded-lg p-3 space-y-2">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-300">
            <Target className="w-3.5 h-3.5 text-emerald-400" />
            <span>Acceptance Criteria & Scope Guard</span>
          </div>
          <ul className="text-xs text-slate-400 space-y-1.5 list-disc pl-4">
            <li>
              <span className="text-slate-200 font-semibold">Target Record:</span> Registration{' '}
              <code className="text-emerald-400 bg-emerald-950/40 px-1 py-0.2 rounded border border-emerald-900/60 font-mono">
                #104
              </code>{' '}
              (Ananya Sharma, November Cloud Quest) status must transition to{' '}
              <code className="text-amber-300 font-mono">cancelled</code>.
            </li>
            <li>
              <span className="text-slate-200 font-semibold">Preservation Rule:</span> Any past or concurrent
              registrations (e.g. October sessions) must{' '}
              <span className="text-rose-400 font-semibold underline decoration-rose-500/50">NOT</span> be modified.
            </li>
          </ul>
        </div>

        {/* Interactive Notice */}
        <div className="flex items-start gap-2 text-xs text-slate-400 bg-slate-800/40 p-2.5 rounded-lg border border-slate-800">
          <AlertCircle className="w-4 h-4 text-indigo-400 flex-shrink-0 mt-0.5" />
          <p className="m-0 leading-relaxed">
            {activeRole === 'developer' ? (
              <>
                <strong className="text-slate-200">Developer Guidance:</strong> Inspect the query below. It works on the starter table, but is it scoped tightly enough to survive reviewer scrutiny?
              </>
            ) : (
              <>
                <strong className="text-slate-200">Reviewer Guidance:</strong> Use the right-hand panel to add an edge case row (such as Ananya's prior attendance) and see if the query breaks!
              </>
            )}
          </p>
        </div>
      </div>
    </div>
  );
};
