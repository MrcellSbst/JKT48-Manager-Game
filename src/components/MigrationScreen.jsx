import { useEffect, useMemo, useRef } from 'react';
import { AlertTriangle, CheckCircle2, Database, Download, LockKeyhole, RefreshCw, ShieldCheck } from 'lucide-react';
import { translateIndonesian } from '../localization.js';

const STAGES = [
  ['reading', 'Reading legacy save'],
  ['normalizing', 'Normalizing game state'],
  ['converting', 'Converting save sections'],
  ['compressing', 'Compressing and encrypting sections'],
  ['writing', 'Writing the new save'],
  ['reading-back', 'Reading the new save back'],
  ['verifying', 'Verifying save data'],
  ['removing', 'Removing old save data'],
];

function localize(value, language) {
  return language === 'id' ? translateIndonesian(value) : value;
}

function normalizeProgress(value) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  const percentage = value <= 1 ? value * 100 : value;
  return Math.max(0, Math.min(100, percentage));
}

function stageIndex(stage) {
  const index = STAGES.findIndex(([id]) => id === stage);
  return index < 0 ? -1 : index;
}

/**
 * Blocking save migration surface. Parent owns migration state and callbacks;
 * this component intentionally has no close, cancel, or navigation action.
 */
export default function MigrationScreen({
  language = 'en',
  migration,
  migrationState,
  status: statusProp,
  stage: stageProp,
  stageLabel: stageLabelProp,
  progress: progressProp,
  completed: completedProp,
  total: totalProp,
  error: errorProp,
  onRetry,
  onDownloadRecovery,
}) {
  const headingRef = useRef(null);
  const state = migration ?? migrationState ?? {};
  const status = statusProp ?? state.status ?? 'running';
  const stage = stageProp ?? state.stage ?? '';
  const stageLabel = stageLabelProp ?? state.stageLabel;
  const progressValue = progressProp ?? state.progress;
  const completed = completedProp ?? state.completed ?? state.completedUnits;
  const total = totalProp ?? state.total ?? state.totalUnits;
  const error = errorProp ?? state.error;
  const retry = onRetry ?? state.onRetry;
  const downloadRecovery = onDownloadRecovery ?? state.onDownloadRecovery;
  const failed = status === 'error' || status === 'failed';
  const active = !['complete', 'completed', 'success', 'done'].includes(status);

  useEffect(() => {
    headingRef.current?.focus();
  }, []);

  useEffect(() => {
    if (!active) return undefined;
    const warnBeforeLeaving = (event) => {
      event.preventDefault();
      event.returnValue = '';
      return '';
    };
    window.addEventListener('beforeunload', warnBeforeLeaving);
    return () => window.removeEventListener('beforeunload', warnBeforeLeaving);
  }, [active]);

  const percentage = useMemo(() => {
    const explicit = normalizeProgress(progressValue);
    if (explicit !== null) return explicit;
    if (Number.isFinite(completed) && Number.isFinite(total) && total > 0) {
      return Math.max(0, Math.min(100, (completed / total) * 100));
    }
    return null;
  }, [completed, progressValue, total]);
  const currentStageIndex = stageIndex(stage);
  const readableStage = stageLabel || (STAGES.find(([id]) => id === stage)?.[1] ?? 'Preparing migration');
  const countLabel = Number.isFinite(completed) && Number.isFinite(total) && total > 0
    ? `${completed} / ${total}`
    : currentStageIndex >= 0 ? `${currentStageIndex + 1} / ${STAGES.length}` : '';
  const title = localize(failed ? 'Save migration needs attention' : 'Updating your save data', language);
  const description = localize(failed
    ? 'Your save was not changed. Retry migration to continue.'
    : 'Your save is being moved to a safer format. Keep this page open until it is finished.', language);

  return (
    <div className={`migration-screen${failed ? ' is-failed' : ''}`} role="dialog" aria-modal="true" aria-labelledby="migration-screen-title" aria-describedby="migration-screen-description">
      <div className="migration-screen-panel">
        <div className="migration-screen-mark" aria-hidden="true">
          {failed ? <AlertTriangle size={28} /> : <Database size={28} />}
          <span />
        </div>
        <p className="migration-screen-kicker">{localize('Save data', language)}</p>
        <h1 id="migration-screen-title" ref={headingRef} tabIndex="-1">{title}</h1>
        <p id="migration-screen-description" className="migration-screen-description">{description}</p>

        <span className="sr-only" aria-live="polite">{localize(readableStage, language)}</span>
        <div className="migration-screen-stage">
          <div>
            <strong>{localize(readableStage, language)}</strong>
            {countLabel ? <span>{countLabel}</span> : null}
          </div>
          <div
            className={`migration-progress${percentage === null ? ' is-indeterminate' : ''}`}
            role="progressbar"
            aria-label={localize('Migration progress', language)}
            aria-valuemin="0"
            aria-valuemax="100"
            {...(percentage === null ? {} : { 'aria-valuenow': Math.round(percentage) })}
          >
            <span style={percentage === null ? undefined : { '--migration-progress-scale': percentage / 100 }} />
          </div>
          <small>{percentage === null ? localize('Preparing migration…', language) : `${Math.round(percentage)}%`}</small>
        </div>

        {failed ? (
          <div className="migration-error" role="alert">
            <AlertTriangle aria-hidden="true" size={18} />
            <span>{localize(error || 'Migration could not be completed.', language)}</span>
          </div>
        ) : (
          <div className="migration-screen-warning">
            <LockKeyhole aria-hidden="true" size={17} />
            <span>{localize('Do not close or leave this page while your save is being updated.', language)}</span>
          </div>
        )}

        <ol className="migration-stage-list" aria-label={localize('Migration steps', language)}>
          {STAGES.map(([id, label], index) => {
            const done = currentStageIndex > index || (percentage === 100 && index <= currentStageIndex);
            const current = !done && currentStageIndex === index;
            return <li key={id} className={`${done ? 'is-done' : ''}${current ? ' is-current' : ''}`}>
              {done ? <CheckCircle2 aria-hidden="true" size={15} /> : current ? <RefreshCw aria-hidden="true" size={15} className="migration-stage-spinner" /> : <span aria-hidden="true" />}
              {localize(label, language)}
            </li>;
          })}
        </ol>

        {failed ? (
          <div className="migration-screen-actions">
            {typeof retry === 'function' ? <button type="button" className="setup-primary" onClick={retry}><RefreshCw aria-hidden="true" size={17} />{localize('Retry migration', language)}</button> : null}
            {typeof downloadRecovery === 'function' ? <button type="button" className="secondary-button" onClick={downloadRecovery}><Download aria-hidden="true" size={17} />{localize('Download recovery copy', language)}</button> : null}
          </div>
        ) : (
          <p className="migration-screen-footnote"><ShieldCheck aria-hidden="true" size={16} />{localize('Your old save is removed only after the new save passes verification.', language)}</p>
        )}
      </div>
    </div>
  );
}
