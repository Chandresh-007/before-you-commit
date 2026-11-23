import React, { useState, useEffect } from 'react';
import { PlusCircle, Trash2, ChevronDown, ChevronUp, AlertTriangle, FlaskConical, PenTool } from 'lucide-react';
import type { Registration, ReviewerExercise, Scenario } from '../types';

interface ReviewerSandboxProps {
  scenario: Scenario;
  currentExercise?: ReviewerExercise;
  reviewerRows: Registration[];
  onAddPreset: () => void;
  onAddCustomRow: (row: Registration) => { success: boolean; error?: string };
  onRemoveRow: (registrationId: number) => void;
  onClearAll: () => void;
}

const VALID_STATUSES = ['scheduled', 'confirmed', 'completed', 'cancelled'] as const;

export const ReviewerSandbox: React.FC<ReviewerSandboxProps> = ({
  scenario,
  currentExercise,
  reviewerRows,
  onAddPreset,
  onAddCustomRow,
  onRemoveRow,
  onClearAll,
}) => {
  const currentPreset =
    currentExercise?.reviewerDefaultPreset ||
    scenario.reviewerDefaultPreset ||
    scenario.initialSeedRows[0];

  const [showCustomForm, setShowCustomForm] = useState(false);
  const [customId, setCustomId] = useState(String(currentPreset.registration_id + 1));
  const [customStudentId, setCustomStudentId] = useState('');
  const [customStudentName, setCustomStudentName] = useState('');
  const [customEvent, setCustomEvent] = useState('');
  const [customDate, setCustomDate] = useState('');
  const [customStatus, setCustomStatus] = useState<string>(currentPreset.status);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    setCustomId(String(currentPreset.registration_id + 1));
    setCustomStudentId('');
    setCustomStudentName('');
    setCustomEvent('');
    setCustomDate('');
    setCustomStatus(currentPreset.status);
  }, [currentPreset]);

  const isPresetActive = reviewerRows.some(
    (r) => r.registration_id === currentPreset.registration_id
  );

  const handleCustomSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    const regId = Number(customId);
    if (!Number.isSafeInteger(regId) || regId <= 0) {
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
      reviewerSource: 'custom',
    });

    if (!result.success) {
      setFormError(result.error || 'Failed to add row.');
    } else {
      setCustomId(String(regId + 1));
      setShowCustomForm(false);
      setCustomStudentId('');
      setCustomStudentName('');
      setCustomEvent('');
      setCustomDate('');
    }
  };

  return (
    <div id="reviewer-panel" className="bg-surface border border-border rounded-xl overflow-hidden">
      {/* Header */}
      <div className="border-b border-border bg-surface-alt px-4 py-2.5 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <FlaskConical className="w-4 h-4 text-teal-600" />
          <h3 id="reviewer-heading" tabIndex={-1} className="text-sm font-semibold text-ink outline-none">
            Test another booking
          </h3>
          {reviewerRows.length > 0 && (
            <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-teal-50 text-teal-700 border border-teal-200">
              {reviewerRows.length} edge-case row{reviewerRows.length !== 1 ? 's' : ''}
            </span>
          )}
        </div>
        {reviewerRows.length > 0 && (
          <button
            type="button"
            onClick={onClearAll}
            className="text-xs text-ink-muted hover:text-danger transition-colors cursor-pointer"
          >
            Clear all
          </button>
        )}
      </div>

      <div className="p-4 space-y-3">
        <p className="text-sm text-ink-muted m-0 leading-relaxed">
          Can you add a booking that tests whether this query restricts its scope properly? Create your own test booking, or use the supplied example.
        </p>

        {/* Action buttons */}
        <div className="flex flex-wrap gap-2 pt-1">
          <button
            type="button"
            aria-expanded={showCustomForm}
            aria-controls="custom-booking-form"
            onClick={() => setShowCustomForm(!showCustomForm)}
            className={`px-3 py-2 rounded-lg text-sm font-semibold flex items-center gap-1.5 transition-colors cursor-pointer ${
              showCustomForm
                ? 'bg-ink text-white'
                : 'bg-surface-alt hover:bg-canvas text-ink-secondary border border-border'
            }`}
          >
            <PenTool className="w-3.5 h-3.5" />
            <span>{showCustomForm ? 'Close form' : 'Create my own booking'}</span>
            {showCustomForm ? <ChevronUp className="w-3 h-3 ml-0.5" /> : <ChevronDown className="w-3 h-3 ml-0.5" />}
          </button>

          <button
            type="button"
            onClick={onAddPreset}
            disabled={isPresetActive}
            className={`px-3 py-2 rounded-lg text-sm font-semibold flex items-center gap-2 transition-colors cursor-pointer ${
              isPresetActive
                ? 'bg-surface-alt text-ink-muted border border-border cursor-not-allowed'
                : 'bg-teal-600 hover:bg-teal-700 text-white shadow-sm'
            }`}
            title={`Add preset row: ${currentPreset.student_name} #${currentPreset.registration_id}`}
          >
            <PlusCircle className="w-3.5 h-3.5" />
            <span>
              {isPresetActive ? `Added: #${currentPreset.registration_id}` : 'Use supplied example'}
            </span>
          </button>
        </div>

        {/* Custom form */}
        {showCustomForm && (
          <form
            id="custom-booking-form"
            onSubmit={handleCustomSubmit}
            className="bg-surface-alt border border-border p-3.5 rounded-lg space-y-3 text-sm mt-2"
          >
            <div className="flex items-center justify-between">
              <span className="font-semibold text-xs text-ink uppercase tracking-wide">
                Custom Test Booking
              </span>
              <span className="text-xs text-ink-muted">
                Pick non-colliding ID and valid columns
              </span>
            </div>

            {formError && (
              <div className="p-2 rounded bg-danger-bg border border-danger-border text-danger flex items-center gap-1.5 text-xs">
                <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" />
                <span role="alert">{formError}</span>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <div>
                <label htmlFor="registration-id" className="block text-xs font-medium text-ink-secondary mb-1">
                  Registration ID (Primary Key)
                </label>
                <input
                  type="number"
                  id="registration-id"
                  value={customId}
                  onChange={(e) => setCustomId(e.target.value)}
                  placeholder="e.g. 188 or 210"
                  className="w-full bg-canvas border border-border rounded px-2.5 py-1.5 text-ink font-mono text-xs focus:outline-none focus:ring-2 focus:ring-teal-600"
                  required
                />
              </div>

              <div>
                <label htmlFor="student-id" className="block text-xs font-medium text-ink-secondary mb-1">
                  Student ID
                </label>
                <input
                  type="text"
                  id="student-id"
                  value={customStudentId}
                  onChange={(e) => setCustomStudentId(e.target.value)}
                  placeholder="e.g. STU-404 or STU-102"
                  className="w-full bg-canvas border border-border rounded px-2.5 py-1.5 text-ink font-mono text-xs focus:outline-none focus:ring-2 focus:ring-teal-600"
                  required
                />
              </div>

              <div>
                <label htmlFor="student-name" className="block text-xs font-medium text-ink-secondary mb-1">
                  Student Name
                </label>
                <input
                  type="text"
                  id="student-name"
                  value={customStudentName}
                  onChange={(e) => setCustomStudentName(e.target.value)}
                  placeholder="e.g. Aarav Patel"
                  className="w-full bg-canvas border border-border rounded px-2.5 py-1.5 text-ink text-xs focus:outline-none focus:ring-2 focus:ring-teal-600"
                  required
                />
              </div>

              <div>
                <label htmlFor="event-name" className="block text-xs font-medium text-ink-secondary mb-1">
                  Event / Company Name
                </label>
                <input
                  type="text"
                  id="event-name"
                  value={customEvent}
                  onChange={(e) => setCustomEvent(e.target.value)}
                  placeholder="e.g. Facebook Interview"
                  className="w-full bg-canvas border border-border rounded px-2.5 py-1.5 text-ink text-xs focus:outline-none focus:ring-2 focus:ring-teal-600"
                  required
                />
              </div>

              <div>
                <label htmlFor="session-date" className="block text-xs font-medium text-ink-secondary mb-1">
                  Session Date & Time
                </label>
                <input
                  type="text"
                  id="session-date"
                  value={customDate}
                  onChange={(e) => setCustomDate(e.target.value)}
                  placeholder="YYYY-MM-DD HH:MM (e.g. 2024-11-25 14:00)"
                  className="w-full bg-canvas border border-border rounded px-2.5 py-1.5 text-ink font-mono text-xs focus:outline-none focus:ring-2 focus:ring-teal-600"
                  required
                />
              </div>

              <div>
                <label htmlFor="custom-status" className="block text-xs font-medium text-ink-secondary mb-1">
                  Initial Status
                </label>
                <select
                  id="custom-status"
                  value={customStatus}
                  onChange={(e) => setCustomStatus(e.target.value)}
                  className="w-full bg-canvas border border-border rounded px-2.5 py-1.5 text-ink text-xs focus:outline-none focus:ring-2 focus:ring-teal-600 font-mono"
                >
                  {VALID_STATUSES.map((status) => (
                    <option key={status} value={status}>
                      {status}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => setShowCustomForm(false)}
                className="px-2.5 py-1 rounded text-xs text-ink-muted hover:text-ink cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="btn primary text-xs py-1 px-3 shadow-sm"
              >
                Add test booking
              </button>
            </div>
          </form>
        )}

        {/* List of active reviewer rows */}
        {reviewerRows.length > 0 && (
          <div className="space-y-2 pt-2 border-t border-border">
            <span className="text-xs font-semibold text-ink-secondary block">
              Active Reviewer Test Bookings ({reviewerRows.length})
            </span>
            <div className="space-y-1.5">
              {reviewerRows.map((row) => (
                <div
                  key={row.registration_id}
                  className="flex items-center justify-between p-2 rounded-lg bg-surface-alt border border-border text-xs"
                >
                  <div className="space-y-0.5">
                    <div className="flex items-center gap-1.5">
                      <span className="font-semibold text-ink">{row.student_name}</span>
                      <span className="font-mono text-ink-muted">#{row.registration_id}</span>
                      <span
                        className={`text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded ${
                          row.reviewerSource === 'custom'
                            ? 'bg-slate-100 text-slate-700 border border-slate-200'
                            : 'bg-teal-50 text-teal-700 border border-teal-200'
                        }`}
                      >
                        {row.reviewerSource === 'custom' ? 'Custom booking' : 'Supplied example'}
                      </span>
                    </div>
                    <div className="text-ink-muted text-[11px]">
                      {row.event_name} · {row.session_date} · <span className="font-mono text-ink-secondary">{row.status}</span>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => onRemoveRow(row.registration_id)}
                    className="p-1 text-ink-muted hover:text-danger rounded transition-colors cursor-pointer"
                    title={`Remove booking #${row.registration_id}`}
                    aria-label={`Remove booking #${row.registration_id}`}
                  >
                    <Trash2 size={13} />
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
