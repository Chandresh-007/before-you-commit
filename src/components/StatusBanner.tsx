import React from 'react';
import { CheckCircle2, AlertTriangle, Pencil, Plus } from 'lucide-react';
import type { DiffReport, Scenario } from '../types';
import { timeOnly } from './bookingDisplay';
import { explainUnintendedRow } from '../engine/diffEngine';

interface Props {
  report: DiffReport | null;
  error: string | null;
  scenario: Scenario;
  projectorMode: boolean;
  reviewerRowsCount?: number;
  onTestAnotherBooking?: () => void;
  onEditQuery?: () => void;
  onStartFresh?: () => void;
  isStale?: boolean;
}

export const StatusBanner: React.FC<Props> = ({
  report,
  error,
  scenario,
  reviewerRowsCount = 0,
  onTestAnotherBooking,
  onEditQuery,
  onStartFresh,
  isStale,
}) => {
  if (error) {
    return (
      <div className="result-banner result-warning" role="alert">
        <AlertTriangle className="flex-shrink-0" size={20} />
        <div>
          <h3>Preview unavailable</h3>
          <p className="font-mono text-xs mt-1 text-ink-secondary">{error}</p>
          {onStartFresh && (
            <button
              type="button"
              onClick={onStartFresh}
              className="btn secondary text-xs py-1 px-2.5 mt-2.5 flex items-center gap-1.5 cursor-pointer shadow-xs"
            >
              <span>Start fresh challenge</span>
            </button>
          )}
        </div>
      </div>
    );
  }

  if (!report) {
    return (
      <div className="empty-result">
        <span className="eyebrow">Ready to review</span>
        <h3>What will this query change?</h3>
        <p>Preview the SQL to compare the result with the ticket.</p>
      </div>
    );
  }

  const { summary } = report;
  const unintended = report.rows.filter((row) => row.classification === 'unintended');
  const targetSeedRow = scenario.initialSeedRows.find(
    (r) => r.registration_id === scenario.targetRegistrationId
  );
  const targetRowDiff = report.rows.find(
    (r) => r.registration_id === scenario.targetRegistrationId
  );
  const targetRow =
    targetRowDiff?.before ||
    targetSeedRow || {
      registration_id: scenario.targetRegistrationId,
      student_id: 'UNKNOWN',
      student_name: 'Target Student',
      event_name: 'Target Event',
      session_date: '',
      status: 'scheduled',
    };

  const isTargetMissed = targetRowDiff?.classification === 'missed';
  const isTargetWrongValue = targetRowDiff?.classification === 'wrong_value';
  const hasVisualCards = unintended.length > 0 || isTargetMissed || isTargetWrongValue;

  const bannerClass = isStale
    ? 'result-warning'
    : unintended.length > 0
    ? 'result-danger'
    : summary.isPass
    ? 'result-pass'
    : 'result-warning';

  return (
    <div className={`result-banner ${bannerClass}`}>
      <div className="result-heading">
        {summary.isPass && !isStale ? (
          <CheckCircle2 className="flex-shrink-0 text-teal-600" size={22} />
        ) : (
          <AlertTriangle className="flex-shrink-0" size={22} />
        )}
        <div>
          <span className="eyebrow">
            {isStale ? 'Query edited · preview again' : 'Preview result'}
          </span>
          <h3>{summary.headline}</h3>
        </div>
      </div>

      {isStale && (
        <p className="stale-notice">
          These results belong to the previous SQL. Preview your edits to update the evidence.
        </p>
      )}

      {hasVisualCards ? (
        <div className="affected-bookings">
          {unintended.map((row) => {
            const timeStr = timeOnly(row.before.session_date);
            const causeExplanation = explainUnintendedRow(row, targetRow, report.sql);
            return (
              <div key={row.registration_id} className="affected-card unintended-card">
                <div className="affected-header">
                  <span className="record-person">
                    {row.before.student_name} <span className="record-id">#{row.registration_id}</span>
                  </span>
                  <span className="badge badge-outside">Outside the ticket</span>
                </div>
                <div className="affected-title">
                  <strong>
                    {row.before.student_name} · {row.before.event_name} · {timeStr}
                  </strong>
                </div>
                <div className="status-transition">
                  <span className="status-tag status-prev">{row.before.status}</span>
                  <span className="arrow" aria-label="changed to">
                    →
                  </span>
                  <b className="status-tag status-wrong">{row.after.status}</b>
                </div>
                <div className="expected-callout">
                  <span>Expected: stay {row.before.status}</span>
                </div>
                <p className="cause-explanation text-xs text-danger font-medium mt-1">
                  {causeExplanation}
                </p>
              </div>
            );
          })}

          {targetRowDiff && targetRowDiff.classification === 'intended' && (
            <div key={targetRowDiff.registration_id} className="affected-card intended-card">
              <div className="affected-header">
                <span className="record-person">
                  {targetRowDiff.before.student_name} <span className="record-id">#{targetRowDiff.registration_id}</span>
                </span>
                <span className="badge badge-intended">Requested change</span>
              </div>
              <div className="affected-title">
                <strong>
                  {targetRowDiff.before.student_name} · {targetRowDiff.before.event_name} · {timeOnly(targetRowDiff.before.session_date)}
                </strong>
              </div>
              <div className="status-transition">
                <span className="status-tag status-prev">{targetRowDiff.before.status}</span>
                <span className="arrow" aria-label="changed to">
                  →
                </span>
                <b className="status-tag status-success">{targetRowDiff.after.status}</b>
              </div>
              <div className="expected-callout text-ink-muted">
                <span>Requested change</span>
              </div>
            </div>
          )}

          {isTargetMissed && (
            <div key={targetRowDiff.registration_id} className="affected-card border border-amber-300 bg-amber-50">
              <div className="affected-header">
                <span className="record-person">
                  {targetRowDiff.before.student_name} <span className="record-id">#{targetRowDiff.registration_id}</span>
                </span>
                <span className="badge badge-outside bg-amber-100 text-amber-800 border-amber-300">Target missed</span>
              </div>
              <div className="affected-title">
                <strong>
                  {targetRowDiff.before.student_name} · {targetRowDiff.before.event_name} · {timeOnly(targetRowDiff.before.session_date)}
                </strong>
              </div>
              <div className="status-transition">
                <span className="status-tag status-prev">{targetRowDiff.before.status}</span>
                <span className="text-xs text-ink-muted font-medium ml-1">(stayed unchanged)</span>
              </div>
              <div className="expected-callout text-amber-900 font-semibold">
                <span>Expected: change to {scenario.targetExpectedStatus}</span>
              </div>
              <p className="text-xs text-ink-secondary mt-1">
                The query did not update target registration #{targetRow.registration_id}. Check your WHERE clause.
              </p>
            </div>
          )}

          {isTargetWrongValue && (
            <div key={targetRowDiff.registration_id} className="affected-card border border-amber-300 bg-amber-50">
              <div className="affected-header">
                <span className="record-person">
                  {targetRowDiff.before.student_name} <span className="record-id">#{targetRowDiff.registration_id}</span>
                </span>
                <span className="badge badge-outside bg-amber-100 text-amber-800 border-amber-300">Wrong status</span>
              </div>
              <div className="affected-title">
                <strong>
                  {targetRowDiff.before.student_name} · {targetRowDiff.before.event_name} · {timeOnly(targetRowDiff.before.session_date)}
                </strong>
              </div>
              <div className="status-transition">
                <span className="status-tag status-prev">{targetRowDiff.before.status}</span>
                <span className="arrow" aria-label="changed to">
                  →
                </span>
                <b className="status-tag status-wrong">{targetRowDiff.after.status}</b>
              </div>
              <div className="expected-callout text-amber-900 font-semibold">
                <span>Expected: {scenario.targetExpectedStatus}</span>
              </div>
              <p className="text-xs text-ink-secondary mt-1">
                Target booking #{targetRow.registration_id} changed to "{targetRowDiff.after.status}", but ticket requires "{scenario.targetExpectedStatus}".
              </p>
            </div>
          )}
        </div>
      ) : (
        <p className="summary-sentence">
          {summary.isPass
            ? `${summary.totalChanged} registration changed. ${
                reviewerRowsCount > 0
                  ? 'All test cases and added bookings were preserved.'
                  : 'This result covers only the starter records shown.'
              }`
            : summary.details}
        </p>
      )}

      <div className="result-actions">
        {summary.isPass && reviewerRowsCount === 0 && (
          <button type="button" className="btn primary" onClick={onTestAnotherBooking}>
            <Plus size={16} />
            Test another booking
          </button>
        )}
        {(!summary.isPass || reviewerRowsCount > 0) && (
          <button type="button" className="btn secondary" onClick={onEditQuery}>
            <Pencil size={15} />
            Edit query
          </button>
        )}
      </div>
    </div>
  );
};
