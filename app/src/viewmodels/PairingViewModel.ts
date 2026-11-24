import { Device as CapDevice } from '@capacitor/device';
import { ViewModel } from '../core/ViewModel';
import { normalizeHubAddress } from '../models/format';
import { mergeHub, type FoundHub } from '../models/hubs';
import { pairWithHub, PairingError } from '../services/PairingService';
import type { Services } from '../services/container';
import type { AppViewModel } from './AppViewModel';

export interface PairingState {
  /** côté téléphone : formulaire */
  address: string;
  code: string;
  busy: boolean;
  error: string | null;
  /** côté téléphone : PC trouvés sur le réseau local */
  found: FoundHub[];
  searching: boolean;
  /** identité du PC choisi dans la liste (null : adresse saisie à la main) */
  selectedHubId: string | null;
  /** côté PC : infos à afficher */
  hub: { addresses: string[]; port: number; pairingCode: string } | null;
}

export class PairingViewModel extends ViewModel<PairingState> {
  constructor(
    private s: Services,
    private app: AppViewModel,
  ) {
    super({ address: '', code: '', busy: false, error: null, found: [], searching: false, selectedHubId: null, hub: null });
  }

  async init(): Promise<void> {
    const desktop = this.s.desktop;
    if (desktop) {
      const hub = await desktop.getHub();
      this.setState({ hub: { addresses: hub.addresses, port: hub.port, pairingCode: hub.pairingCode } });
      this.track(
        desktop.onPairingCode((pairingCode) =>
          this.setState((st) => ({ hub: st.hub ? { ...st.hub, pairingCode } : st.hub })),
        ),
      );
    } else {
      const prev = this.app.state.connection?.baseUrl.replace(/^https?:\/\//, '') ?? '';
      this.setState({ address: prev });
      if (this.s.discovery.supported) void this.search();
    }
  }

  get discoverySupported(): boolean {
    return this.s.discovery.supported;
  }

  /** Cherche les PC du réseau local ; le premier trouvé est présélectionné si rien n'est choisi. */
  async search(): Promise<void> {
    if (this.state.searching) return;
    this.setState({ searching: true, error: null });
    // Android 17 : sans accès au réseau local, la recherche ne trouverait rien.
    if ((await this.app.ensureLocalNetwork()) !== 'granted') {
      return this.setState({ searching: false });
    }
    const add = (h: FoundHub) =>
      this.setState((st) => {
        const found = mergeHub(st.found, h);
        const autoPick = !st.selectedHubId && (!st.address || st.address === this.lastAuto);
        if (!autoPick) return { found };
        this.lastAuto = `${h.host}:${h.port}`;
        return { found, selectedHubId: h.id, address: this.lastAuto };
      });
    try {
      for (const h of await this.s.discovery.discover(add, 3500)) add(h);
    } catch (e) {
      console.warn('découverte', e);
    } finally {
      this.setState({ searching: false });
    }
  }

  /** Adresse pré-remplie automatiquement (remplaçable tant que l'utilisateur n'a rien saisi). */
  private lastAuto = '';

  selectHub(h: FoundHub) {
    this.lastAuto = `${h.host}:${h.port}`;
    this.setState({ selectedHubId: h.id, address: this.lastAuto, error: null });
  }

  setAddress(address: string) {
    this.setState({ address, selectedHubId: null, error: null });
  }

  setCode(code: string) {
    this.setState({ code: code.replace(/\D/g, '').slice(0, 6), error: null });
  }

  get canSubmit(): boolean {
    return !this.state.busy && this.state.code.length === 6 && !!normalizeHubAddress(this.state.address);
  }

  async submit(): Promise<void> {
    const baseUrl = normalizeHubAddress(this.state.address);
    if (!baseUrl) return this.setState({ error: 'Adresse invalide (ex. 192.168.1.20:47321)' });
    this.setState({ busy: true, error: null });
    // Android 17 : sans accès au réseau local, la requête échouerait en « PC injoignable » trompeur.
    if ((await this.app.ensureLocalNetwork()) !== 'granted') {
      return this.setState({
        busy: false,
        error: 'SwipeCast a besoin de l’accès au réseau local pour joindre ton PC. Autorise-le (bandeau en haut), puis réessaie.',
      });
    }
    try {
      const name = await deviceName();
      const conn = await pairWithHub(baseUrl, this.state.code, { name, platform: this.s.platform });
      await this.app.setConnection(conn);
      this.setState({ busy: false, code: '' });
    } catch (e) {
      this.setState({ busy: false, error: e instanceof PairingError ? e.message : String(e) });
    }
  }

  async unpair(deviceId: string): Promise<void> {
    await this.s.desktop?.unpair(deviceId);
  }
}

async function deviceName(): Promise<string> {
  try {
    const info = await CapDevice.getInfo();
    return info.name || `${info.manufacturer} ${info.model}`.trim() || 'Téléphone';
  } catch {
    return 'Navigateur';
  }
}
