export function Snackbar({ text, tone }: { text: string; tone: 'ok' | 'warn' | 'bad' }) {
  const color = { ok: 'border-ok/40', warn: 'border-warn/40', bad: 'border-bad/50' }[tone];
  return (
    <div
      role="status"
      className={`fixed left-1/2 w-max max-w-[90vw] top-[max(1rem,env(safe-area-inset-top))] z-[60] -translate-x-1/2 animate-fade-in rounded-2xl border ${color} bg-ink-800/95 px-5 py-3 text-base font-semibold text-white shadow-2xl`}
    >
      {text}
    </div>
  );
}
