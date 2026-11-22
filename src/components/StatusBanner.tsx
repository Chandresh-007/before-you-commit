import React from 'react';
import { CheckCircle2, AlertTriangle, XCircle, Info, Clock, AlertOctagon } from 'lucide-react';
import type { DiffReport } from '../types';

interface StatusBannerProps {
  report: DiffReport | null;
  error: string | null;
  projectorMode: boolean;
}

export const StatusBanner: React.FC<StatusBannerProps> = ({
  report,
  error,
  projectorMode,
}) => {
  if (error) {
    return (
      <div className="bg-rose-950/70 border-2 border-rose-500 rounded-xl p-4 sm:p-5 text-rose-100 shadow-xl flex items-start gap-3">
        <XCircle className="w-6 h-6 text-rose-400 flex-shrink-0 mt-0.5" />
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold uppercase tracking-wider bg-rose-900/60 text-rose-300 border border-rose-700 px-2 py-0.5 rounded">
              SQL Execution / Constraint Error
            </span>
          </div>
          <p
            className={`font-mono text-rose-200 m-0 ${
              projectorMode ? 'text-lg font-bold' : 'text-sm font-semibold'
            }`}
          >
            {error}
          </p>
        </div>
      </div>
    );
  }

  if (!report) {
    return (
      <div className="bg-slate-900/70 border border-slate-800 rounded-xl p-4 text-slate-400 flex items-center justify-between gap-3 text-xs">
        <div className="flex items-center gap-2">
          <Info className="w-4 h-4 text-indigo-400" />
          <span>
            Ready to test. Click <strong className="text-slate-200">"Preview Change"</strong> or press{' '}
            <kbd className="bg-slate-800 border border-slate-700 px-1.5 py-0.5 rounded font-mono text-[11px] text-slate-300">
              Ctrl+Enter
            </kbd>{' '}
            to dry-run in SQLite.
          </span>
        </div>
      </div>
    );
  }

  const { summary, executionTimeMs } = report;

  // Choose styling based on outcome
  let bannerClass = 'bg-slate-900 border-slate-700';
  let badgeClass = 'bg-slate-800 text-slate-300 border-slate-600';
  let Icon = Info;

  if (summary.unintendedCount > 0) {
    bannerClass = 'bg-rose-950/80 border-2 border-rose-500 shadow-rose-900/40 shadow-xl';
    badgeClass = 'bg-rose-900/80 text-rose-200 border-rose-600 font-bold';
    Icon = AlertOctagon;
  } else if (summary.isPass) {
    bannerClass = 'bg-emerald-950/80 border-2 border-emerald-500 shadow-emerald-900/40 shadow-xl';
    badgeClass = 'bg-emerald-900/80 text-emerald-200 border-emerald-600 font-bold';
    Icon = CheckCircle2;
  } else if (summary.wrongValueCount > 0) {
    bannerClass = 'bg-purple-950/80 border-2 border-purple-500 shadow-purple-900/40 shadow-xl';
    badgeClass = 'bg-purple-900/80 text-purple-200 border-purple-600 font-bold';
    Icon = AlertTriangle;
  } else if (summary.missedCount > 0) {
    bannerClass = 'bg-amber-950/80 border-2 border-amber-500 shadow-amber-900/40 shadow-xl';
    badgeClass = 'bg-amber-900/80 text-amber-200 border-amber-600 font-bold';
    Icon = AlertTriangle;
  }

  return (
    <div
      className={`rounded-xl p-4 sm:p-5 transition-all flex flex-col md:flex-row md:items-center justify-between gap-4 ${bannerClass}`}
    >
      <div className="flex items-start sm:items-center gap-3">
        <div className="p-2 rounded-lg bg-black/30 border border-white/10 flex-shrink-0">
          <Icon className="w-6 h-6 text-white" />
        </div>
        <div className="space-y-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`text-xs px-2.5 py-0.5 rounded-full border uppercase tracking-wider ${badgeClass}`}>
              {summary.isPass
                ? 'VERIFIED PASS'
                : summary.unintendedCount > 0
                ? 'CRITICAL REGRESSION'
                : 'SPEC MISMATCH'}
            </span>
            <span className="text-xs text-slate-300/80 font-mono flex items-center gap-1">
              <Clock className="w-3 h-3" /> {executionTimeMs}ms (in-browser SQLite)
            </span>
          </div>

          <h3
            className={`font-extrabold text-white tracking-tight m-0 ${
              projectorMode ? 'text-2xl sm:text-3xl' : 'text-lg sm:text-xl'
            }`}
          >
            {summary.headline}
          </h3>

          <p className="text-xs sm:text-sm text-slate-200/90 m-0 max-w-2xl leading-relaxed">
            {summary.details}
          </p>
        </div>
      </div>

      {/* Metric Pills */}
      <div className="flex items-center gap-2 self-start md:self-auto flex-wrap font-mono text-xs">
        <div className="bg-black/40 border border-white/10 px-3 py-1.5 rounded-lg text-center">
          <div className="text-[10px] text-slate-400 uppercase font-semibold">Changed</div>
          <div className="text-sm font-bold text-white">{summary.totalChanged}</div>
        </div>
        <div className="bg-black/40 border border-emerald-500/30 px-3 py-1.5 rounded-lg text-center">
          <div className="text-[10px] text-emerald-400 uppercase font-semibold">Intended</div>
          <div className="text-sm font-bold text-emerald-300">{summary.intendedCount}</div>
        </div>
        <div
          className={`border px-3 py-1.5 rounded-lg text-center ${
            summary.unintendedCount > 0
              ? 'bg-rose-950 border-rose-500 text-rose-300'
              : 'bg-black/40 border-white/10 text-slate-400'
          }`}
        >
          <div className="text-[10px] uppercase font-semibold">Unintended</div>
          <div className="text-sm font-bold">{summary.unintendedCount}</div>
        </div>
      </div>
    </div>
  );
};
