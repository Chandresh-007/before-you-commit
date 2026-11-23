import React from 'react';
import { Check, AlertTriangle, Database, ShieldCheck } from 'lucide-react';
import type { DiffReport, Registration, ReviewerExercise, RowDiff, Scenario } from '../types';
import { bookingTime } from './bookingDisplay';

interface Props {
  report: DiffReport | null;
  scenario: Scenario;
  currentExercise?: ReviewerExercise;
  reviewerRowsCount: number;
  reviewerRows?: Registration[];
  projectorMode: boolean;
}

const labels: Record<string, string> = {
  intended: 'Requested change',
  unintended: 'Outside the ticket',
  missed: 'Target missed',
  wrong_value: 'Wrong status',
  unchanged: 'Preserved',
};

function RecordCard({
  row,
  isReviewerRow,
}: {
  row: RowDiff;
  isReviewerRow?: boolean;
}) {
  const isChanged = row.changedColumns.includes('status');
  const isPreserved = row.classification === 'unchanged' && isReviewerRow;

  return (
    <article
      className={`record-card record-${row.classification} ${
        isPreserved ? 'record-preserved' : ''
      }`}
    >
      <div className="record-top">
        <span className="record-person">
          {row.before.student_name}{' '}
          <span className="record-id font-mono">#{row.registration_id}</span>
        </span>
        <span
          className={`record-label ${
            row.classification === 'intended' || isPreserved
              ? 'label-success'
              : row.classification === 'unintended'
              ? 'label-danger'
              : 'label-warning'
          }`}
        >
          {isPreserved ? (
            <>
              <ShieldCheck size={14} />
              <span>Preserved · {row.before.status}</span>
            </>
          ) : row.classification === 'intended' ? (
            <>
              <Check size={14} />
              <span>{labels[row.classification]}</span>
            </>
          ) : row.classification === 'unchanged' ? (
            <>
              <Check size={14} />
              <span>Preserved</span>
            </>
          ) : (
            <>
              <AlertTriangle size={14} />
              <span>{labels[row.classification]}</span>
            </>
          )}
        </span>
      </div>

      <div className="record-main">
        <strong className="record-event">{row.before.event_name}</strong>
        <span className="record-date">{bookingTime(row.before.session_date)}</span>
      </div>

      <div className="record-bottom">
        <div className="status-transition">
          {isPreserved ? (
            <span className="status-badge status-preserved">
              {row.before.status} <span className="status-sub">· unchanged</span>
            </span>
          ) : isChanged ? (
            <>
              <span className="status-badge before">{row.before.status}</span>
              <span className="arrow" aria-label="changed to">
                →
              </span>
              <b
                className={`status-badge ${
                  row.classification === 'intended' ? 'after-intended' : 'after-wrong'
                }`}
              >
                {row.after.status}
              </b>
            </>
          ) : (
            <span className="status-badge before">
              {row.before.status} <span className="status-sub">· unchanged</span>
            </span>
          )}
        </div>
        <span className="record-id font-mono text-xs">{row.before.student_id}</span>
      </div>

      {(row.classification === 'missed' || row.classification === 'wrong_value') && (
        <p className="record-note">Ticket requires: {row.expected.status}</p>
      )}
      {row.classification === 'unintended' && (
        <p className="record-note text-danger font-medium">
          Outside the ticket — this booking should stay {row.before.status}.
        </p>
      )}
    </article>
  );
}

export const DiffTable: React.FC<Props> = ({
  report,
  scenario,
  reviewerRows = [],
  reviewerRowsCount,
}) => {
  const reviewerIds = new Set(reviewerRows.map((r) => r.registration_id));
  const startingRows = [...scenario.initialSeedRows, ...reviewerRows];

  // Important rows to show immediately (mutated rows + added reviewer rows)
  const important =
    report?.rows.filter(
      (r) => r.classification !== 'unchanged' || reviewerIds.has(r.registration_id)
    ) || [];

  // Control/unmodified records from starter data to collapse
  const unchanged =
    report?.rows.filter(
      (r) => r.classification === 'unchanged' && !reviewerIds.has(r.registration_id)
    ) || [];

  return (
    <section className="evidence-panel" aria-label="Booking evidence">
      <div className="panel-heading">
        <div className="flex items-center gap-2">
          <Database size={16} className="text-teal-600" />
          <h3>{report ? 'Booking evidence & diff' : 'Starting records'}</h3>
        </div>
        <span className="text-xs text-ink-muted">{startingRows.length} total records</span>
      </div>

      {report && (
        <div className="record-list" aria-label="Active diff records">
          {important.map((row) => (
            <RecordCard
              key={row.registration_id}
              row={row}
              isReviewerRow={reviewerIds.has(row.registration_id)}
            />
          ))}
        </div>
      )}

      {report && unchanged.length > 0 && (
        <details className="records-disclosure">
          <summary>Show {unchanged.length} unchanged records</summary>
          <div className="record-list">
            {unchanged.map((row) => (
              <RecordCard key={row.registration_id} row={row} />
            ))}
          </div>
        </details>
      )}

      <details className="records-disclosure dataset" open={!report}>
        <summary>
          {report ? 'Inspect complete starting dataset' : 'registrations · all columns'}
        </summary>
        <div className="dataset-scroll" tabIndex={0} role="region" aria-label="Complete starting dataset">
          <table>
            <thead>
              <tr>
                {[
                  'registration_id',
                  'student_id',
                  'student_name',
                  'event_name',
                  'session_date',
                  'status',
                ].map((key) => (
                  <th key={key} scope="col">
                    {key}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {startingRows.map((row) => (
                <tr key={row.registration_id}>
                  <td>
                    <span className="font-mono">{row.registration_id}</span>
                  </td>
                  <td>
                    <span className="font-mono">{row.student_id}</span>
                  </td>
                  <td>{row.student_name}</td>
                  <td>{row.event_name}</td>
                  <td>
                    <span className="font-mono">{row.session_date}</span>
                  </td>
                  <td>
                    <span className="status-pill">{row.status}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>

      {report && (
        <p className="evidence-note">
          {report.summary.isPass
            ? reviewerRowsCount > 0
              ? 'The query successfully satisfies the ticket and preserves all reviewer bookings.'
              : 'A passing preview on starter data only proves the query works on the records shown.'
            : 'Compare the affected bookings with the ticket, then adjust the WHERE clause and preview again.'}
        </p>
      )}
    </section>
  );
};
