import React, { useRef } from 'react';
import { Play, RotateCcw, CheckCircle2, Shield, Code2 } from 'lucide-react';

interface SqlEditorProps {
  sql: string;
  onChange: (newSql: string) => void;
  onRunPreview: () => void;
  onResetSql: () => void;
  onApplySolution: () => void;
  isRunning: boolean;
  projectorMode: boolean;
}

export const SqlEditor: React.FC<SqlEditorProps> = ({
  sql,
  onChange,
  onRunPreview,
  onResetSql,
  onApplySolution,
  isRunning,
  projectorMode,
}) => {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Handle Tab key inside textarea for clean indenting
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Tab') {
      e.preventDefault();
      const textarea = textareaRef.current;
      if (!textarea) return;

      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;
      const val = textarea.value;

      textarea.value = val.substring(0, start) + '  ' + val.substring(end);
      textarea.selectionStart = textarea.selectionEnd = start + 2;
      onChange(textarea.value);
    } else if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      onRunPreview();
    }
  };

  const lineCount = (sql.match(/\n/g) || []).length + 1;
  const charCount = sql.length;

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-lg flex flex-col">
      {/* Editor Header Bar */}
      <div className="border-b border-slate-800 bg-slate-950/70 px-4 py-2.5 flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <Code2 className="w-4 h-4 text-indigo-400" />
          <span className="text-xs font-bold text-slate-200 uppercase tracking-wider">
            Candidate SQL Query
          </span>
          <span className="text-[11px] font-mono text-slate-500">
            ({charCount} chars · {lineCount} lines)
          </span>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onResetSql}
            className="px-2.5 py-1 text-xs font-medium text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded transition-colors flex items-center gap-1 cursor-pointer"
            title="Restore starter query"
          >
            <RotateCcw className="w-3 h-3" />
            <span>Reset SQL</span>
          </button>
          <button
            type="button"
            onClick={onApplySolution}
            className="px-2.5 py-1 text-xs font-medium text-emerald-400 hover:text-emerald-300 hover:bg-emerald-950/40 border border-emerald-900/50 rounded transition-colors flex items-center gap-1 cursor-pointer"
            title="Load the scoped primary-key fix for demonstration"
          >
            <CheckCircle2 className="w-3 h-3" />
            <span>Load Solution</span>
          </button>
        </div>
      </div>

      {/* Editor Body */}
      <div className="relative flex-1 bg-slate-950 flex font-mono text-xs sm:text-sm">
        {/* Line Numbers Column */}
        <div
          className={`select-none py-3 px-3 text-right text-slate-600 bg-slate-950/90 border-r border-slate-800/80 font-mono ${
            projectorMode ? 'text-base leading-6' : 'text-xs leading-5'
          }`}
          aria-hidden="true"
        >
          {Array.from({ length: lineCount }).map((_, i) => (
            <div key={i}>{i + 1}</div>
          ))}
        </div>

        {/* Textarea */}
        <textarea
          ref={textareaRef}
          value={sql}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={handleKeyDown}
          spellCheck={false}
          className={`w-full h-44 sm:h-52 bg-transparent text-emerald-300 p-3 outline-none resize-y font-mono tracking-tight selection:bg-indigo-600/40 ${
            projectorMode ? 'text-base leading-6 font-semibold' : 'text-xs sm:text-sm leading-5'
          }`}
          placeholder="Enter UPDATE statement targeting registrations..."
        />
      </div>

      {/* Action Footer & Constraint Indicator */}
      <div className="border-t border-slate-800 bg-slate-950/60 p-3 sm:px-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-1.5 text-[11px] text-slate-400">
          <Shield className="w-3.5 h-3.5 text-indigo-400 flex-shrink-0" />
          <span>
            Strict Constraint: Exactly 1 <code className="text-slate-300 font-mono">UPDATE</code> on{' '}
            <code className="text-slate-300 font-mono">registrations</code> modifying only{' '}
            <code className="text-slate-300 font-mono">status</code>.
          </span>
        </div>

        <button
          type="button"
          onClick={onRunPreview}
          disabled={isRunning}
          className={`px-5 py-2.5 rounded-lg font-bold text-white shadow-xl transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 ${
            projectorMode
              ? 'text-base bg-emerald-600 hover:bg-emerald-500 shadow-emerald-600/40 ring-2 ring-emerald-400'
              : 'text-sm bg-emerald-600 hover:bg-emerald-500 shadow-emerald-600/30'
          }`}
          title="Execute query against isolated scenario database (Ctrl + Enter)"
        >
          <Play className="w-4 h-4 fill-white" />
          <span>{isRunning ? 'Executing SQL...' : 'Preview Change (Ctrl+Enter)'}</span>
        </button>
      </div>
    </div>
  );
};
