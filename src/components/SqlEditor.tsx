import React, { useRef, useState } from 'react';
import { Play, RotateCcw, Lightbulb, Loader2, ChevronRight, HelpCircle } from 'lucide-react';

interface Props {
  sql: string;
  onChange: (value: string) => void;
  onRunPreview: () => void;
  onResetSql: () => void;
  onApplySolution: () => void;
  isRunning: boolean;
  projectorMode: boolean;
  activeRole?: 'developer' | 'reviewer';
}

export const SqlEditor: React.FC<Props> = ({
  sql,
  onChange,
  onRunPreview,
  onResetSql,
  onApplySolution,
  isRunning,
}) => {
  const highlight = useRef<HTMLPreElement>(null);
  const [hintStage, setHintStage] = useState<number>(0);

  const tokens = sql.split(
    /('(?:''|[^'])*'|--[^\n]*|\b(?:UPDATE|SET|WHERE|AND|OR|IN|NOT|NULL|LIKE|IS)\b|\b\d+\b)/gi
  );

  return (
    <section className="sql-panel" aria-label="SQL editor">
      <div className="panel-heading">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold text-ink">Candidate SQL</h3>
          <span className="text-xs text-ink-muted">SQLite Web Worker</span>
        </div>
        <button
          type="button"
          className="text-button flex items-center gap-1 text-xs text-ink-muted hover:text-ink cursor-pointer"
          onClick={onResetSql}
          title="Restore starter SQL query"
          aria-label="Reset SQL query to starter state"
        >
          <RotateCcw size={13} />
          Reset query
        </button>
      </div>

      <div className="code-editor">
        <pre ref={highlight} aria-hidden="true" className="font-mono">
          {tokens.map((token, i) => (
            <span
              key={i}
              className={
                token.startsWith("'")
                  ? 'sql-string'
                  : token.startsWith('--')
                  ? 'sql-comment'
                  : /^(UPDATE|SET|WHERE|AND|OR|IN|NOT|NULL|LIKE|IS)$/i.test(token)
                  ? 'sql-keyword'
                  : /^\d+$/.test(token)
                  ? 'sql-number'
                  : ''
              }
            >
              {token}
            </span>
          ))}
          {'\n'}
        </pre>
        <textarea
          id="candidate-sql"
          aria-label="Candidate SQL"
          aria-describedby="sql-keyboard-hint"
          value={sql}
          onChange={(e) => onChange(e.target.value)}
          onScroll={(e) => {
            if (highlight.current) {
              highlight.current.scrollTop = e.currentTarget.scrollTop;
              highlight.current.scrollLeft = e.currentTarget.scrollLeft;
            }
          }}
          onKeyDown={(e) => {
            if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
              e.preventDefault();
              if (!isRunning) onRunPreview();
            }
          }}
          spellCheck={false}
          autoCapitalize="off"
          autoCorrect="off"
          wrap="off"
        />
      </div>

      <div className="editor-actions">
        <span id="sql-keyboard-hint" className="text-xs text-ink-muted">
          Ctrl / ⌘ + Enter to preview
        </span>
        <button
          type="button"
          className="btn primary"
          disabled={isRunning}
          onClick={onRunPreview}
        >
          {isRunning ? <Loader2 className="animate-spin" size={16} /> : <Play size={16} />}
          {isRunning ? 'Previewing…' : 'Preview changes'}
        </button>
      </div>

      {/* Progressive hint disclosure in stages */}
      <details className="solution-disclosure">
        <summary className="flex items-center gap-1.5 cursor-pointer text-xs font-medium text-ink-secondary hover:text-ink">
          <Lightbulb size={14} className="text-amber-500" />
          <span>Need a hint?</span>
        </summary>

        <div className="hint-content space-y-2 mt-2 pt-2 border-t border-border text-xs text-ink-secondary">
          {/* Stage 1: Conceptual question */}
          <div className="hint-stage">
            <p className="font-semibold text-ink flex items-center gap-1">
              <HelpCircle size={13} className="text-teal-600" />
              <span>Could this WHERE clause match two bookings?</span>
            </p>
            <p className="mt-1 leading-relaxed">
              On the starter records, filtering by student or event appears to work because only one booking exists. But what happens if the student registers for another round or session later?
            </p>
          </div>

          {/* Stage 2: Conceptual clue (shown on demand) */}
          {hintStage >= 1 ? (
            <div className="hint-stage bg-surface-alt p-2 rounded border border-border">
              <p className="font-semibold text-ink">Clue:</p>
              <p className="mt-1 leading-relaxed">
                Relational tables assign an immutable primary key to isolate individual reservations. Look at the visible columns in the dataset — which column guarantees that you will update exactly one booking and never touch another?
              </p>
            </div>
          ) : (
            <button
              type="button"
              className="text-button text-teal-700 hover:text-teal-900 font-medium flex items-center gap-1 cursor-pointer"
              onClick={() => setHintStage(1)}
            >
              <span>Show clue</span>
              <ChevronRight size={13} />
            </button>
          )}

          {/* Stage 3: Worked solution (shown on demand) */}
          {hintStage >= 1 && (
            <div>
              {hintStage >= 2 ? (
                <div className="hint-solution bg-teal-50 p-2.5 rounded border border-teal-200 space-y-2">
                  <p className="text-teal-900 leading-relaxed">
                    Filter by the unique primary key <code>registration_id</code>:
                  </p>
                  <button
                    type="button"
                    className="btn secondary text-xs py-1 px-2.5 bg-white border border-teal-300 text-teal-800 hover:bg-teal-100 cursor-pointer font-medium"
                    onClick={onApplySolution}
                  >
                    Use the scoped solution
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  className="text-button text-teal-700 hover:text-teal-900 font-medium flex items-center gap-1 cursor-pointer"
                  onClick={() => setHintStage(2)}
                >
                  <span>Show worked solution</span>
                  <ChevronRight size={13} />
                </button>
              )}
            </div>
          )}
        </div>
      </details>
    </section>
  );
};
