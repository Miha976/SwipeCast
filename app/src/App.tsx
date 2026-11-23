import { useEffect, useMemo } from 'react';
import { useViewModel } from './core/ViewModel';
import { AppViewModel } from './viewmodels/AppViewModel';
import { createServices } from './services/container';
import { StatusPill } from './views/components/StatusPill';
import { HandoffSheet } from './views/components/HandoffSheet';
import { Snackbar } from './views/components/Snackbar';
import { BrowserBar } from './views/components/BrowserBar';
import { HomePage } from './views/pages/HomePage';
import { PairingPage } from './views/pages/PairingPage';
import { Icon } from './views/components/Icon';

export function App() {
  const services = useMemo(() => createServices(), []);
  const app = useMemo(() => new AppViewModel(services), [services]);
  const state = useViewModel(app);

  useEffect(() => {
    void app.init(); // idempotent (StrictMode exécute les effets deux fois en dev)
  }, [app]);

  if (!state.ready) {
    return <div className="grid h-full place-items-center text-ink-400">Chargement…</div>;
  }

  // Windows en navigation : seule la barre est visible, la page occupe le reste de la fenêtre.
  if (state.browsing && services.browser.reactChrome) {
    return (
      <BrowserBar
        state={state}
        peer={app.peer}
        onBack={() => app.browserBack()}
        onClose={() => app.closeBrowser()}
        onSend={() => app.sendToPeer()}
        onAccept={() => app.acceptIncoming()}
        onDismiss={() => app.dismissIncoming()}
        onOpenPopup={() => app.openBlockedPopup()}
        onDismissPopup={() => app.dismissBlockedPopup()}
      />
    );
  }

  return (
    <div className="app-shell">
      <header className="flex flex-wrap items-center gap-3">
        <h1 className="mr-auto flex items-center gap-2 text-2xl font-bold sm:text-3xl">
          <span className="grid h-10 w-10 place-items-center rounded-2xl bg-gradient-to-br from-brand to-brand-cyan text-white shadow-glow">
            <Icon name="swipeUp" className="h-6 w-6" />
          </span>
          <span>
            Swipe<span className="text-gradient">Cast</span>
          </span>
        </h1>
        {state.connection && <StatusPill status={state.status} peer={app.peer} />}
        {state.view === 'pairing' && state.connection && (
          <button className="btn btn-ghost" onClick={() => app.showPairing(false)}>
            Fermer
          </button>
        )}
      </header>

      {state.status === 'unauthorized' && state.view === 'home' && (
        <div className="card border-bad/30 text-bad">
          Ce téléphone n’est plus reconnu par le PC.{' '}
          <button className="underline" onClick={() => app.showPairing(true)}>
            Appairer à nouveau
          </button>
        </div>
      )}

      <main>{state.view === 'pairing' ? <PairingPage services={services} app={app} /> : <HomePage app={app} state={state} />}</main>

      {state.incoming && (
        <HandoffSheet handoff={state.incoming} onAccept={() => app.acceptIncoming()} onDismiss={() => app.dismissIncoming()} />
      )}
      {state.snackbar && <Snackbar {...state.snackbar} />}
    </div>
  );
}
