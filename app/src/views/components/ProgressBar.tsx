import { formatTime, progressPercent } from '../../models/format';

export function ProgressBar({ current, duration, showTimes = true }: { current: number; duration: number; showTimes?: boolean }) {
  return (
    <div className="w-full">
      <div className="progress-track" role="progressbar" aria-valuenow={Math.round(current)} aria-valuemax={Math.round(duration)}>
        <span style={{ width: `${progressPercent(current, duration)}%` }} />
      </div>
      {showTimes && (
        <div className="mt-1.5 flex justify-between text-sm tabular-nums text-ink-400">
          <span className="font-semibold text-white">{formatTime(current)}</span>
          <span>{duration ? formatTime(duration) : '—'}</span>
        </div>
      )}
    </div>
  );
}
