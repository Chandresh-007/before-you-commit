import React, { useState } from 'react';
import { ShieldAlert, PlusCircle, Trash2, ChevronDown, ChevronUp, AlertTriangle } from 'lucide-react';
import type { Registration, Scenario } from '../types';

interface ReviewerSandboxProps {
  scenario: Scenario;
  reviewerRows: Registration[];
  onAddPreset: () => void;
  onAddCustomRow: (row: Registration) => { success: boolean; error?: string };
  onRemoveRow: (registrationId: number) => void;
  onClearAll: () => void;
}

export const ReviewerSandbox: React.FC<ReviewerSandboxProps> = ({
  scenario,
  reviewerRows,
  onAddPreset,
  onAddCustomRow,
  onRemoveRow,
  onClearAll,
}) => {
  const [showCustomForm, setShowCustomForm] = useState(false);
  const [customId, setCustomId] = useState('88');
  const [customStudentId, setCustomStudentId] = useState('STU-402');
  const [customStudentName, setCustomStudentName] = useState('Ananya Sharma');
  const [customEvent, setCustomEvent] = useState('Cloud Quest');
  const [customDate, setCustomDate] = useState('2024-09-20');
  const [customStatus, setCustomStatus] = useState('completed');
  const [formError, setFormError] = useState<string | null>(null);

  const isPresetActive = reviewerRows.some(
    (r) => r.registration_id === scenario.reviewerDefaultPreset.registration_id
  );

  const handleCustomSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    const regId = parseInt(customId, 10);
    if (isNaN(regId) || regId <= 0) {
      setFormError('Registration ID must be a positive integer.');
      return;
    }

    if (!customStudentId.trim() || !customEvent.trim() || !customDate.trim()) {
      setFormError('All fields (Student ID, Event Name, Session Date) are required.');
      return;
    }

    const result = onAddCustomRow({
      registration_id: regId,
      student_id: customStudentId.trim(),
      student_name: customStudentName.trim() || 'Custom Student',
      event_name: customEvent.trim(),
      session_date: customDate.trim(),
      status: customStatus,
    });

    if (!result.success) {
      setFormError(result.error || 'Failed to add row.');
    } else {
      // Advance suggested ID for next addition
      setCustomId(String(regId + 1));
      setShowCustomForm(false);
    }
  };

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-lg space-y-0">
      {/* Sandbox Header */}
      <div className="border-b border-slate-800 bg-slate-950/70 px-4 py-2.5 flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <ShieldAlert className="w-4 h-4 text-amber-400" />
          <span className="text-xs font-bold text-slate-200 uppercase tracking-wider">
            Reviewer Edge-Case Sandbox
          </span>
          <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-300 border border-amber-500/30">
            {reviewerRows.length} Edge Case{reviewerRows.length === 1 ? '' : 's'} Active
          </span>
        </div>

        {reviewerRows.length > 0 && (
          <button
            type="button"
            onClick={onClearAll}
            className="text-xs text-rose-400 hover:text-rose-300 hover:underline flex items-center gap-1 cursor-pointer"
          >
            Clear edge cases
          </button>
        )}
      </div>

      <div className="p-4 space-y-3">
        <p className="text-xs text-slate-300 leading-relaxed m-0">
          Act as a skeptical code reviewer. Inject realistic database states to verify whether the developer’s
          query accidentally updates rows beyond the ticket’s intended scope.
        </p>

        {/* Action Preset Buttons */}
        <div className="flex flex-wrap gap-2 pt-1">
          <button
            type="button"
            onClick={onAddPreset}
            disabled={isPresetActive}
            className={`px-3 py-2 rounded-lg text-xs font-bold flex items-center gap-2 transition-all cursor-pointer ${
              isPresetActive
                ? 'bg-amber-950/40 text-amber-400 border border-amber-800/60 opacity-60 cursor-not-allowed'
                : 'bg-amber-600 hover:bg-amber-500 text-white shadow-md shadow-amber-600/30'
            }`}
            title="Inject Ananya's completed October attendance (#87) into the database"
          >
            <PlusCircle className="w-3.5 h-3.5" />
            <span>
              {isPresetActive ? '✓ October Row #87 Injected' : '+ Add Previous Attendance (Oct 18 · #87)'}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setShowCustomForm(!showCustomForm)}
            className="px-3 py-2 rounded-lg text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition-colors flex items-center gap-1.5 cursor-pointer"
          >
            <span>{showCustomForm ? 'Close Custom Form' : '+ Add Custom Registration Row'}</span>
            {showCustomForm ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
          </button>
        </div>

        {/* Custom Row Form (Phase 2) */}
        {showCustomForm && (
          <form
            onSubmit={handleCustomSubmit}
            className="bg-slate-950/80 border border-slate-800 p-3.5 rounded-lg space-y-3 mt-2 text-xs"
          >
            <div className="font-semibold text-slate-200 flex items-center justify-between">
              <span>Insert Custom Edge-Case Record</span>
              <span className="text-[11px] text-slate-400 font-normal">Validated against table schema</span>
            </div>

            {formError && (
              <div className="flex items-center gap-1.5 text-xs text-rose-300 bg-rose-950/50 border border-rose-800/80 p-2 rounded">
                <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" />
                <span>{formError}</span>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <div>
                <label className="block text-[11px] text-slate-400 mb-1">Registration ID (PK)</label>
                <input
                  type="number"
                  value={customId}
                  onChange={(e) => setCustomId(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded px-2.5 py-1.5 text-slate-200 font-mono"
                  required
                />
              </div>

              <div>
                <label className="block text-[11px] text-slate-400 mb-1">Student ID</label>
                <input
                  type="text"
                  value={customStudentId}
                  onChange={(e) => setCustomStudentId(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded px-2.5 py-1.5 text-slate-200 font-mono"
                  required
                />
              </div>

              <div>
                <label className="block text-[11px] text-slate-400 mb-1">Student Name</label>
                <input
                  type="text"
                  value={customStudentName}
                  onChange={(e) => setCustomStudentName(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded px-2.5 py-1.5 text-slate-200"
                />
              </div>

              <div>
                <label className="block text-[11px] text-slate-400 mb-1">Event Name</label>
                <input
                  type="text"
                  value={customEvent}
                  onChange={(e) => setCustomEvent(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded px-2.5 py-1.5 text-slate-200"
                  required
                />
              </div>

              <div>
                <label className="block text-[11px] text-slate-400 mb-1">Session Date (YYYY-MM-DD)</label>
                <input
                  type="date"
                  value={customDate}
                  onChange={(e) => setCustomDate(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded px-2.5 py-1.5 text-slate-200 font-mono"
                  required
                />
              </div>

              <div>
                <label className="block text-[11px] text-slate-400 mb-1">Initial Status</label>
                <select
                  value={customStatus}
                  onChange={(e) => setCustomStatus(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded px-2.5 py-1.5 text-slate-200"
                >
                  <option value="completed">completed</option>
                  <option value="registered">registered</option>
                  <option value="waitlist">waitlist</option>
                  <option value="cancelled">cancelled</option>
                </select>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => setShowCustomForm(false)}
                className="px-3 py-1.5 rounded bg-slate-800 text-slate-300 hover:bg-slate-700"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-1.5 rounded bg-indigo-600 hover:bg-indigo-500 font-semibold text-white shadow cursor-pointer"
              >
                Add Row to Table
              </button>
            </div>
          </form>
        )}

        {/* Active Injected Rows List */}
        {reviewerRows.length > 0 && (
          <div className="space-y-1.5 pt-1">
            <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block">
              Injected Reviewer Rows:
            </span>
            <div className="space-y-1">
              {reviewerRows.map((row) => (
                <div
                  key={row.registration_id}
                  className="flex items-center justify-between text-xs bg-slate-950/60 border border-amber-900/40 p-2 rounded-lg"
                >
                  <div className="flex items-center gap-2">
                    <span className="font-mono font-bold text-amber-400 bg-amber-950/50 border border-amber-800 px-1.5 py-0.5 rounded text-[11px]">
                      #{row.registration_id}
                    </span>
                    <span className="text-slate-200 font-medium">{row.student_name}</span>
                    <span className="text-slate-400 font-mono text-[11px]">({row.student_id})</span>
                    <span className="text-slate-400">· {row.event_name}</span>
                    <span className="text-slate-400 font-mono text-[11px]">({row.session_date})</span>
                    <span className="text-slate-300 font-mono px-1 rounded bg-slate-800 text-[11px]">
                      {row.status}
                    </span>
                  </div>

                  <button
                    type="button"
                    onClick={() => onRemoveRow(row.registration_id)}
                    className="text-slate-500 hover:text-rose-400 p-1 rounded transition-colors cursor-pointer"
                    title="Remove this reviewer row"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
