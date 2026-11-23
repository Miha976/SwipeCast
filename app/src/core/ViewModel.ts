import { useEffect, useSyncExternalStore } from 'react';

/**
 * Socle MVVM.
 *  - Model      : src/models (types, règles pures) + src/services (I/O : réseau, navigateur, stockage…)
 *  - ViewModel  : classes sans React qui exposent un état immuable + des commandes
 *  - View       : composants React qui lisent l'état via useViewModel() et appellent les commandes
 *
 * Les ViewModels sont testables sans DOM et indépendants de la plateforme (les services sont injectés).
 */
export abstract class ViewModel<S extends object> {
  private listeners = new Set<() => void>();
  private disposers: Array<() => void> = [];

  protected constructor(private _state: S) {}

  get state(): S {
    return this._state;
  }

  protected setState(patch: Partial<S> | ((s: S) => Partial<S>)): void {
    const next = typeof patch === 'function' ? patch(this._state) : patch;
    this._state = { ...this._state, ...next };
    this.listeners.forEach((l) => l());
  }

  /** Enregistre un abonnement à libérer dans dispose(). */
  protected track(unsubscribe: () => void): void {
    this.disposers.push(unsubscribe);
  }

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getSnapshot = (): S => this._state;

  dispose(): void {
    this.disposers.splice(0).forEach((d) => d());
    this.listeners.clear();
  }
}

export function useViewModel<S extends object>(vm: ViewModel<S>): S {
  return useSyncExternalStore(vm.subscribe, vm.getSnapshot);
}

/** Lie la durée de vie d'un ViewModel à celle d'un composant. */
export function useDisposeOnUnmount(vm: { dispose(): void }): void {
  useEffect(() => () => vm.dispose(), [vm]);
}
