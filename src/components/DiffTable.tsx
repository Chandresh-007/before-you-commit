import React from 'react';
import { Check, AlertTriangle, ArrowRight, XCircle, ShieldCheck, HelpCircle } from 'lucide-react';
import type { ChangeClassification, DiffReport, RowDiff } from '../types';

interface DiffTableProps {
  report: DiffReport | null;
  projectorMode: boolean;
}

const classificationBadge = (classification: ChangeClassification) => {
  switch (classification) {
    case 'intended':
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/50">
          <Check className="w-3.5 h-3.5" />
          <span>INTENDED CHANGE</span>
        </span>
      );
    case 'unintended':
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-extrabold bg-rose-600/30 text-rose-300 border-2 border-rose-500 animate-pulse">
          <AlertTriangle className="w-3.5 h-3.5 text-rose-400" />
          <span>UNINTENDED CHANGE</span>
        </span>
      );
    case 'missed':
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-bold bg-amber-500/20 text-amber-300 border border-amber-500/50">
          <XCircle className="w-3.5 h-3.5" />
          <span>MISSED (NO CHANGE)</span>
        </span>
      );
    case 'wrong_value':
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-bold bg-purple-500/20 text-purple-300 border border-purple-500/50">
          <AlertTriangle className="w-3.5 h-3.5" />
          <span>WRONG STATUS</span>
        </span>
      );
    case 'unchanged':
    default:
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium bg-slate-800 text-slate-400 border border-slate-700">
          <ShieldCheck className="w-3 h-3 text-slate-500" />
          <span>UNCHANGED (OK)</span>
        </span>
      );
  }
};

export const DiffTable: React.FC<DiffTableProps> = ({ report, projectorMode }) => {
  if (!report) {
    return (
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-8 text-center text-slate-500 space-y-2">
        <p className="text-sm font-medium m-0">No query preview executed yet.</p>
        <p className="text-xs text-slate-600 m-0">
          Write or inspect your SQL statement and click "Preview Change" to run dry-run diff analysis.
        </p>
      </div>
    );
  }

  const { rows, summary } = report;

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-xl space-y-0">
      {/* Table Header Controls */}
      <div className="border-b border-slate-800 bg-slate-950/70 px-4 py-3 flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold text-slate-200 uppercase tracking-wider">
            Live Database Row Diff (Table: registrations)
          </span>
          <span className="text-[11px] font-mono text-slate-400">
            ({rows.length} total rows evaluated)
          </span>
        </div>

        <div className="text-xs text-slate-400">
          Primary Key: <code className="text-indigo-400 font-mono">registration_id</code>
        </div>
      </div>

      {/* Responsive Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="border-b border-slate-800 bg-slate-950/90 text-slate-400 text-xs uppercase font-semibold">
              <th className="py-2.5 px-3 font-mono">Reg ID (PK)</th>
              <th className="py-2.5 px-3">Student Name (ID)</th>
              <th className="py-2.5 px-3">Event Name</th>
              <th className="py-2.5 px-3 font-mono">Date</th>
              <th className="py-2.5 px-3">Before Status</th>
              <th className="py-2.5 px-3">After Status</th>
              <th className="py-2.5 px-3">Review Classification</th>
            </tr>
          </thead>
          <tbody className={`divide-y divide-slate-800/80 ${projectorMode ? 'text-sm' : 'text-xs'}`}>
            {rows.map((rowDiff: RowDiff) => {
              const { registration_id, before, after, classification, changedColumns } = rowDiff;
              const hasStatusChanged = changedColumns.includes('status');

              let rowBg = 'hover:bg-slate-800/40';
              if (classification === 'unintended') {
                rowBg = 'bg-rose-950/40 hover:bg-rose-950/60 font-semibold';
              } else if (classification === 'intended') {
                rowBg = 'bg-emerald-950/20 hover:bg-emerald-950/30';
              } else if (classification === 'wrong_value') {
                rowBg = 'bg-purple-950/20 hover:bg-purple-950/30';
              }

              return (
                <tr key={registration_id} className={`transition-colors ${rowBg}`}>
                  {/* Reg ID */}
                  <td className="py-3 px-3 font-mono font-bold text-slate-300">
                    #{registration_id}
                  </td>

                  {/* Student */}
                  <td className="py-3 px-3 text-slate-200">
                    <div>{before.student_name}</div>
                    <div className="font-mono text-[11px] text-slate-400">{before.student_id}</div>
                  </td>

                  {/* Event */}
                  <td className="py-3 px-3 text-slate-300">{before.event_name}</td>

                  {/* Session Date */}
                  <td className="py-3 px-3 font-mono text-slate-300">{before.session_date}</td>

                  {/* Before Status */}
                  <td className="py-3 px-3">
                    <span
                      className={`font-mono px-2 py-0.5 rounded border ${
                        before.status === 'completed'
                          ? 'bg-cyan-950/50 text-cyan-300 border-cyan-800/60'
                          : before.status === 'registered'
                          ? 'bg-blue-950/50 text-blue-300 border-blue-800/60'
                          : 'bg-slate-800 text-slate-300 border-slate-700'
                      }`}
                    >
                      {before.status}
                    </span>
                  </td>

                  {/* After Status */}
                  <td className="py-3 px-3">
                    {hasStatusChanged ? (
                      <div className="flex items-center gap-1.5 font-mono">
                        <span className="line-through text-slate-500">{before.status}</span>
                        <ArrowRight className="w-3.5 h-3.5 text-slate-400" />
                        <span
                          className={`font-bold px-2 py-0.5 rounded border ${
                            classification === 'unintended'
                              ? 'bg-rose-950 text-rose-200 border-rose-500 font-extrabold ring-1 ring-rose-500'
                              : classification === 'intended'
                              ? 'bg-emerald-950 text-emerald-200 border-emerald-500'
                              : 'bg-purple-950 text-purple-200 border-purple-500'
                          }`}
                        >
                          {after.status}
                        </span>
                      </div>
                    ) : (
                      <span className="font-mono text-slate-400 px-2 py-0.5 rounded bg-slate-800/50">
                        {after.status} (no change)
                      </span>
                    )}
                  </td>

                  {/* Classification Badge */}
                  <td className="py-3 px-3">{classificationBadge(classification)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Classroom Pedagogical Explanation Box */}
      <div className="p-4 bg-slate-950 border-t border-slate-800 flex items-start gap-3 text-xs leading-relaxed">
        <HelpCircle className="w-4 h-4 text-indigo-400 flex-shrink-0 mt-0.5" />
        <div className="space-y-1">
          <span className="font-bold text-slate-200">Classroom Lesson — Why This Happens:</span>
          {summary.unintendedCount > 0 ? (
            <p className="text-slate-300 m-0">
              The query used <code className="text-rose-300 font-mono">WHERE student_id = 'STU-402'</code>. In
              relational database design, <code className="font-mono">student_id</code> is a domain identifier,
              not the primary key of this table. Because Ananya has multiple registrations across different dates,
              updating by student ID unconditionally overwrote her completed October record (<code className="font-mono">#87</code>).
              To make SQL safe against regressions, target the candidate primary key{' '}
              <code className="text-emerald-400 font-mono">registration_id = 104</code> or include the date predicate.
            </p>
          ) : summary.isPass ? (
            <p className="text-slate-300 m-0">
              Targeting <code className="text-emerald-400 font-mono">WHERE registration_id = 104</code> adheres to
              defensive SQL principles. It guarantees exact single-row granularity, preventing side-effects on prior or future student activity.
            </p>
          ) : (
            <p className="text-slate-400 m-0">
              Inspect the table diff above to ensure only the target ticket record is modified.
            </p>
          )}
        </div>
      </div>
    </div>
  );
};
