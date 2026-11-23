import { useEffect, useMemo, type FormEvent } from 'react';
import { useViewModel } from '../../core/ViewModel';
import { PairingViewModel } from '../../viewmodels/PairingViewModel';
import type { AppViewModel } from '../../viewmodels/AppViewModel';
import type { Services } from '../../services/container';
import { PlatformIcon, Icon } from '../components/Icon';
import { timeAgo } from '../../models/format';

export function PairingPage({ services, app }: { services: Services; app: AppViewModel }) {
  const vm = useMemo(() => new PairingViewModel(services, app), [services, app]);
  const st = useViewModel(vm);
  const appState = useViewModel(app);

  useEffect(() => {
    void vm.init();
    return () => vm.dispose();
  }, [vm]);

  // ----- PC : afficher le code à saisir sur le téléphone
  if (st.hub) {
    const others = appState.devices.filter((d) => d.id !== appState.self?.id);
    return (
      <div className="grid gap-5 lg:grid-cols-2">
        <section className="card">
          <h2 className="mb-1 text-2xl">Appairer un téléphone</h2>
          <p className="mb-6 text-ink-400">
            Ouvre SwipeCast sur ton téléphone (même Wi-Fi) et saisis ces informations.
          </p>
          <span className="label">Adresse du PC</span>
          <div className="mb-5 flex flex-col gap-2">
            {st.hub.addresses.length ? (
              st.hub.addresses.map((a) => (
                <code key={a} className="select-all rounded-xl bg-ink-900 px-4 py-3 text-xl font-semibold text-white">
                  {a}:{st.hub!.port}
                </code>
              ))
            ) : (
              <p className="text-warn">Aucune interface réseau détectée.</p>
            )}
          </div>
          <span className="label">Code (usage unique)</span>
          <p className="text-gradient select-all text-5xl font-bold tracking-[.3em] tabular-nums sm:text-6xl">
            {st.hub.pairingCode}
          </p>
        </section>

        <section className="card">
          <h2 className="mb-4 text-xl">Appareils appairés</h2>
          {others.length === 0 && <p className="text-ink-400">Aucun pour l’instant.</p>}
          <ul className="flex flex-col gap-2">
            {others.map((d) => (
              <li key={d.id} className="flex items-center gap-3 rounded-2xl bg-white/[.04] p-3">
                <PlatformIcon platform={d.platform} className="h-6 w-6 text-ink-400" />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold text-white">{d.name}</p>
                  <p className="text-sm text-ink-400">{d.online ? 'Connecté' : `Vu ${timeAgo(d.lastSeen)}`}</p>
                </div>
                <button className="btn btn-danger h-10 min-h-0 px-3" onClick={() => vm.unpair(d.id)} aria-label={`Retirer ${d.name}`}>
                  <Icon name="trash" className="h-5 w-5" />
                </button>
              </li>
            ))}
          </ul>
        </section>
      </div>
    );
  }

  // ----- Téléphone : formulaire
  const submit = (e: FormEvent) => {
    e.preventDefault();
    void vm.submit();
  };

  return (
    <section className="card mx-auto w-full max-w-lg">
      <h2 className="mb-1 text-2xl">Connecter ton PC</h2>
      <p className="mb-6 text-ink-400">
        Sur le PC, ouvre SwipeCast → <strong className="text-ink-200">Appairage</strong>. Recopie l’adresse et le code affichés.
      </p>
      <form onSubmit={submit} className="flex flex-col gap-5">
        <div>
          <label className="label" htmlFor="addr">
            Adresse du PC
          </label>
          <input
            id="addr"
            className="input"
            inputMode="url"
            autoCapitalize="off"
            autoCorrect="off"
            placeholder="192.168.1.20:47321"
            value={st.address}
            onChange={(e) => vm.setAddress(e.target.value)}
          />
        </div>
        <div>
          <label className="label" htmlFor="code">
            Code à 6 chiffres
          </label>
          <input
            id="code"
            className="input text-center text-3xl font-bold tracking-[.4em] tabular-nums"
            inputMode="numeric"
            autoComplete="one-time-code"
            placeholder="••••••"
            value={st.code}
            onChange={(e) => vm.setCode(e.target.value)}
          />
        </div>
        {st.error && <p className="rounded-xl bg-bad/10 p-3 text-bad">{st.error}</p>}
        <button className="btn btn-primary text-lg" disabled={!vm.canSubmit}>
          {st.busy ? 'Connexion…' : 'Appairer'}
        </button>
        {appState.connection && (
          <button type="button" className="btn btn-ghost" onClick={() => app.showPairing(false)}>
            Annuler
          </button>
        )}
      </form>
    </section>
  );
}
