import type { AppState, AppViewModel } from '../../viewmodels/AppViewModel';
import { UrlBar } from '../components/UrlBar';
import { PeerCard } from '../components/PeerCard';
import { HistoryList } from '../components/HistoryList';
import { SettingsCard } from '../components/SettingsCard';
import { Icon } from '../components/Icon';

export function HomePage({ app, state }: { app: AppViewModel; state: AppState }) {
  const peer = app.peer;
  const isPhone = state.platform === 'android';

  return (
    <div className="flex flex-col gap-5">
      <section className="card">
        <h2 className="mb-1 text-2xl sm:text-3xl">Regarder une vidéo</h2>
        <p className="mb-4 text-ink-400">
          Ouvre-la ici pour pouvoir la {isPhone ? 'glisser vers ton PC' : 'renvoyer sur ton téléphone'} à tout moment.
        </p>
        <UrlBar onOpen={(v) => app.openUrl(v)} />
        <p className="mt-4 text-sm text-ink-400">
          <Icon name="swipeUp" className="mr-1.5 inline h-4 w-4 align-[-3px] text-brand-soft" />
          Dans la page, glisse la pastille <strong className="text-ink-200">Envoyer</strong> vers le haut
          {!isPhone && <> ou appuie sur <kbd className="rounded bg-white/10 px-1.5">Alt</kbd>+<kbd className="rounded bg-white/10 px-1.5">S</kbd></>}.
        </p>
      </section>

      {peer ? (
        <PeerCard peer={peer} session={state.peerSessions[peer.id]} onResume={() => app.resumePeer(peer.id)} />
      ) : (
        state.connection && (
          <section className="card border-dashed text-center">
            <p className="mb-4 text-ink-400">Aucun autre appareil appairé.</p>
            <button className="btn btn-primary" onClick={() => app.showPairing(true)}>
              {state.platform === 'windows' ? 'Appairer mon téléphone' : 'Appairer mon PC'}
            </button>
          </section>
        )
      )}

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <section className="flex min-w-0 flex-col gap-3">
          <h2 className="flex items-center gap-2 text-lg text-ink-200">
            <Icon name="history" className="h-5 w-5" /> Récemment
          </h2>
          <HistoryList
            items={state.history}
            onOpen={(e) => (e.currentTime > 0 ? app.resume(e, 'opened') : app.openUrl(e.url))}
          />
        </section>
        <SettingsCard app={app} state={state} />
      </div>
    </div>
  );
}
