import { Device as CapDevice } from '@capacitor/device';
import { ViewModel } from '../core/ViewModel';
import { normalizeHubAddress } from '../models/format';
import { pairWithHub, PairingError } from '../services/PairingService';
import type { Services } from '../services/container';
import type { AppViewModel } from './AppViewModel';

export interface PairingState {
  /** côté téléphone : formulaire */
  address: string;
  code: string;
  busy: boolean;
  error: string | null;
  /** côté PC : infos à afficher */
  hub: { addresses: string[]; port: number; pairingCode: string } | null;
}

export class PairingViewModel extends ViewModel<PairingState> {
  constructor(
    private s: Services,
    private app: AppViewModel,
  ) {
    super({ address: '', code: '', busy: false, error: null, hub: null });
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
    }
  }

  setAddress(address: string) {
    this.setState({ address, error: null });
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
