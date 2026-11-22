import React from 'react';
import { Database, Share2, RotateCcw, Monitor, ShieldCheck, Sparkles } from 'lucide-react';

interface HeaderProps {
  onReset: () => void;
  onShare: () => void;
  isSharing: boolean;
  projectorMode: boolean;
  onToggleProjectorMode: () => void;
  scenarioTitle: string;
}

export const Header: React.FC<HeaderProps> = ({
  onReset,
  onShare,
  isSharing,
  projectorMode,
  onToggleProjectorMode,
  scenarioTitle,
}) => {
  return (
    <header className="border-b border-slate-800 bg-slate-900/90 backdrop-blur-md sticky top-0 z-30 px-4 py-3 sm:px-6">
      <div className="max-w-7xl mx-auto flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        {/* Brand & Context */}
        <div className="flex items-center space-x-3">
          <div className="p-2.5 bg-indigo-600/20 text-indigo-400 border border-indigo-500/30 rounded-xl flex items-center justify-center shadow-inner">
            <Database className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold tracking-tight text-white m-0">
                Before You Commit
              </h1>
              <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
                <ShieldCheck className="w-3 h-3" /> WASM SQLite
              </span>
            </div>
            <p className="text-xs text-slate-400 font-medium m-0 truncate max-w-md">
              {scenarioTitle}
            </p>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-2 self-start md:self-auto flex-wrap">
          <button
            type="button"
            onClick={onToggleProjectorMode}
            className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition-all flex items-center gap-1.5 cursor-pointer ${
              projectorMode
                ? 'bg-amber-500/20 text-amber-300 border-amber-500/50 shadow-sm'
                : 'bg-slate-800 text-slate-300 border-slate-700 hover:bg-slate-700'
            }`}
            title="Toggle high-contrast projector mode for back-of-the-room visibility"
          >
            <Monitor className="w-3.5 h-3.5" />
            <span>{projectorMode ? 'Projector Mode: ON' : 'Projector Mode'}</span>
          </button>

          <button
            type="button"
            onClick={onReset}
            className="px-3 py-1.5 text-xs font-medium rounded-lg border border-slate-700 bg-slate-800 text-slate-300 hover:bg-slate-700 hover:text-white transition-all flex items-center gap-1.5 cursor-pointer"
            title="Reset dataset and query to initial starting state"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Reset</span>
          </button>

          <button
            type="button"
            onClick={onShare}
            disabled={isSharing}
            className="px-4 py-1.5 text-xs font-semibold rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white shadow-lg shadow-indigo-600/30 transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
            title="Generate a shareable replay URL to reproduce this exact case on another laptop"
          >
            {isSharing ? (
              <Sparkles className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Share2 className="w-3.5 h-3.5" />
            )}
            <span>Share Replay</span>
          </button>
        </div>
      </div>
    </header>
  );
};
