import React, { useState } from 'react';
import { Copy, Check, X, Cloud, CloudOff, AlertTriangle, ExternalLink } from 'lucide-react';

interface ShareModalProps {
  isOpen: boolean;
  onClose: () => void;
  shareUrl: string;
  isCloudShared: boolean;
  cloudError?: string;
}

export const ShareModal: React.FC<ShareModalProps> = ({
  isOpen,
  onClose,
  shareUrl,
  isCloudShared,
  cloudError,
}) => {
  const [copied, setCopied] = useState(false);

  if (!isOpen) return null;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      // Fallback
      setCopied(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-lg w-full p-5 sm:p-6 shadow-2xl space-y-4">
        {/* Modal Header */}
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <div className="flex items-center gap-2">
            {isCloudShared ? (
              <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
                <Cloud className="w-5 h-5" />
              </div>
            ) : (
              <div className="p-2 rounded-lg bg-amber-500/10 text-amber-400 border border-amber-500/30">
                <CloudOff className="w-5 h-5" />
              </div>
            )}
            <div>
              <h3 className="text-base font-bold text-white m-0">Shareable Replay Recipe</h3>
              <p className="text-xs text-slate-400 m-0">
                {isCloudShared
                  ? 'Persisted to AWS DynamoDB (API Gateway HTTP API)'
                  : 'Self-Contained Local Replay Recipe'}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-slate-200 p-1.5 rounded-lg hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Real Cloud Error Reporting (if any) */}
        {cloudError && (
          <div className="bg-amber-950/40 border border-amber-800/80 rounded-lg p-3 text-xs text-amber-300 space-y-1">
            <div className="flex items-center gap-1.5 font-semibold">
              <AlertTriangle className="w-3.5 h-3.5" />
              <span>Cloud Persistence Notice</span>
            </div>
            <p className="text-amber-200/90 m-0 leading-relaxed font-mono text-[11px]">
              {cloudError}
            </p>
            <p className="text-amber-400 text-[11px] m-0">
              Generated a self-contained local replay link so your demonstration proceeds without interruption.
            </p>
          </div>
        )}

        {/* Replay URL Field */}
        <div className="space-y-1.5">
          <label className="block text-xs font-medium text-slate-300">
            Replay URL (copy and open on any device):
          </label>
          <div className="flex gap-2">
            <input
              type="text"
              readOnly
              value={shareUrl}
              className="flex-1 bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs font-mono text-emerald-300 select-all"
            />
            <button
              type="button"
              onClick={handleCopy}
              className={`px-4 py-2 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                copied
                  ? 'bg-emerald-600 text-white'
                  : 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-md shadow-indigo-600/30'
              }`}
            >
              {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copied ? 'Copied!' : 'Copy'}</span>
            </button>
          </div>
        </div>

        {/* Educational Privacy & Replication Note */}
        <div className="text-xs text-slate-400 bg-slate-950/60 p-3 rounded-lg border border-slate-800/80 space-y-1.5 leading-relaxed">
          <div className="flex items-center gap-1.5 font-semibold text-slate-300">
            <ExternalLink className="w-3.5 h-3.5 text-indigo-400" />
            <span>How Replay Works</span>
          </div>
          <p className="m-0">
            Anyone with this link can view the change ticket, inspect the injected reviewer edge cases, and run
            the SQL query in their own browser's SQLite engine.
          </p>
          <p className="m-0 text-[11px] text-slate-500">
            No real student credentials or database connection strings are transmitted.
          </p>
        </div>

        {/* Close Button */}
        <div className="flex justify-end pt-2">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg transition-colors cursor-pointer"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};
