import React, { useEffect, useRef, useState } from 'react';
import { Copy, Check, X, Info, AlertTriangle } from 'lucide-react';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  shareUrl: string;
  isCloudShared: boolean;
  shareOutcome?: 'cloud' | 'local' | 'failure';
  cloudError?: string;
  isSqlStale?: boolean;
}

export const ShareModal: React.FC<Props> = ({
  isOpen,
  onClose,
  shareUrl,
  isCloudShared,
  shareOutcome = isCloudShared ? 'cloud' : shareUrl ? 'local' : 'failure',
  cloudError,
  isSqlStale,
}) => {
  const dialog = useRef<HTMLDialogElement>(null);
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setCopied(false);
      setCopyError(false);
      dialog.current?.showModal();
    } else {
      dialog.current?.close();
    }
  }, [isOpen, shareUrl]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setCopyError(false);
    } catch {
      setCopied(false);
      setCopyError(true);
    }
  };

  return (
    <dialog
      ref={dialog}
      className="share-dialog"
      aria-labelledby="share-title"
      onCancel={onClose}
      onClose={onClose}
    >
      <div className="panel-heading">
        <h3 id="share-title">Share this replay</h3>
        <button
          type="button"
          className="text-button"
          aria-label="Close share dialog"
          onClick={onClose}
        >
          <X size={18} />
        </button>
      </div>

      <div className="share-content space-y-3 p-4">
        <p className="text-sm text-ink-secondary leading-relaxed m-0">
          {isCloudShared
            ? 'Replay recipe successfully saved to AWS DynamoDB. Anyone opening this link will see the change ticket, the candidate SQL, and any reviewer test bookings.'
            : 'Self-contained offline replay generated. All review state is encoded directly in the URL hash fragment.'}
        </p>

        {isSqlStale && (
          <div role="status" className="share-warning bg-amber-50 border border-amber-200 p-2.5 rounded-lg text-xs text-amber-900 flex items-start gap-2">
            <AlertTriangle size={15} className="text-amber-600 flex-shrink-0 mt-0.5" />
            <div>
              <strong>Candidate SQL notice:</strong> This link saves the SQL currently typed in your editor. Preview your edits to update the in-browser evidence table.
            </div>
          </div>
        )}

        {cloudError && (
          <div role="status" className="share-warning bg-amber-50 border border-amber-200 p-2.5 rounded-lg text-xs text-amber-900 space-y-1">
            <strong>Cloud save notice</strong>
            <p className="m-0 text-amber-800">{cloudError}</p>
            <p className="m-0 text-amber-800 font-medium">A self-contained replay link is ready below.</p>
          </div>
        )}

        {shareOutcome === 'failure' || !shareUrl ? (
          <div role="alert" className="share-error bg-red-50 border border-red-200 p-3.5 rounded-lg text-xs text-red-900 space-y-2">
            <div className="flex items-center gap-1.5 font-semibold text-red-800">
              <AlertTriangle size={15} />
              <span>Unable to create replay link</span>
            </div>
            <p className="m-0 text-red-700">{cloudError || 'An error occurred while generating the replay link.'}</p>
            <p className="m-0 text-ink-muted">
              What you can change: ensure your SQL and reviewer test bookings do not exceed size limits, or check your network connection.
            </p>
          </div>
        ) : (
          <div>
            <label htmlFor="replay-link" className="block text-xs font-semibold text-ink-secondary mb-1">
              {isCloudShared ? 'Cloud replay link (30-day retention)' : 'Self-contained link (offline fallback)'}
            </label>
            <div className="share-link flex gap-2">
              <input
                id="replay-link"
                readOnly
                value={shareUrl}
                onFocus={(e) => e.target.select()}
                className="flex-1 bg-canvas border border-border rounded px-2.5 py-1.5 text-ink font-mono text-xs focus:outline-none focus:ring-2 focus:ring-teal-600"
              />
              <button
                type="button"
                className="btn primary text-xs py-1.5 px-3 flex items-center gap-1.5 shadow-sm"
                onClick={copy}
              >
                {copied ? <Check size={14} /> : <Copy size={14} />}
                {copied ? 'Copied!' : 'Copy'}
              </button>
            </div>
            <p role="status" className="text-xs text-ink-muted mt-2 mb-0">
              {copyError
                ? 'Could not copy automatically. Select the link and copy it with Ctrl+C or ⌘C.'
                : copied
                ? 'Link copied to clipboard.'
                : 'Opening the link loads the exact database state and dry-runs the saved SQL.'}
            </p>
          </div>
        )}

        <div className="text-xs text-ink-muted border-t border-border pt-3 space-y-1">
          <div className="flex items-center gap-1.5 font-medium text-ink-secondary">
            <Info size={14} />
            <span>Privacy & Retention Details</span>
          </div>
          <p className="m-0 text-[11px] leading-relaxed">
            {isCloudShared
              ? 'Stored anonymously in AWS DynamoDB (ap-south-1). Automatically expires after 30 days via DynamoDB TTL. No real student PII, credentials, or production connection strings are transmitted.'
              : 'Encoded directly in the URL hash fragment (#localReplay=). Operates 100% client-side with zero server transmission.'}
          </p>
        </div>
      </div>
    </dialog>
  );
};
