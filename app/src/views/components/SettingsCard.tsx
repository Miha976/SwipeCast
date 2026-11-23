import type { AppViewModel, AppState } from '../../viewmodels/AppViewModel';

export function SettingsCard({ app, state }: { app: AppViewModel; state: AppState }) {
  const { settings } = state;
  return (
    <section className="card flex flex-col gap-5">
      <h2 className="text-xl">Réglages</h2>

      <label className="flex items-center justify-between gap-4">
        <span>
          <span className="block font-semibold text-white">Plein écran automatique</span>
          <span className="text-sm text-ink-400">à l’ouverture d’une vidéo reçue</span>
        </span>
        <input
          type="checkbox"
          className="h-6 w-6 accent-brand"
          checked={settings.autoFullscreen}
          onChange={(e) => app.updateSettings({ autoFullscreen: e.target.checked })}
        />
      </label>

      <label className="flex items-center justify-between gap-4">
        <span>
          <span className="block font-semibold text-white">Reculer à la reprise</span>
          <span className="text-sm text-ink-400">pour retrouver le fil</span>
        </span>
        <select
          className="input w-28 min-h-0 py-2 text-base"
          value={settings.rewindSeconds}
          onChange={(e) => app.updateSettings({ rewindSeconds: Number(e.target.value) })}
        >
          {[0, 3, 5, 10, 15].map((s) => (
            <option key={s} value={s}>
              {s} s
            </option>
          ))}
        </select>
      </label>

      <div className="flex flex-wrap gap-2 border-t border-white/5 pt-4">
        <button className="btn btn-ghost" onClick={() => app.showPairing(true)}>
          {state.platform === 'windows' ? 'Appairage' : 'Changer de PC'}
        </button>
        {state.platform !== 'windows' && state.connection && (
          <button className="btn btn-danger" onClick={() => app.forgetConnection()}>
            Oublier ce PC
          </button>
        )}
        <button className="btn btn-ghost" onClick={() => app.clearHistory()}>
          Vider l’historique
        </button>
      </div>
    </section>
  );
}
