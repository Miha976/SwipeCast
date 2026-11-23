import { useState, type FormEvent } from 'react';
import { Icon } from './Icon';

export function UrlBar({ onOpen }: { onOpen: (input: string) => void }) {
  const [value, setValue] = useState('');

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!value.trim()) return;
    onOpen(value);
    setValue('');
  };

  const paste = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text) onOpen(text);
    } catch {
      /* presse-papiers refusé : l'utilisateur colle à la main */
    }
  };

  return (
    <form onSubmit={submit} className="flex gap-2">
      <label className="sr-only" htmlFor="url">
        Lien ou recherche
      </label>
      <input
        id="url"
        className="input flex-1"
        inputMode="url"
        autoComplete="off"
        autoCapitalize="off"
        placeholder="Coller un lien de vidéo ou rechercher…"
        value={value}
        onChange={(e) => setValue(e.target.value)}
      />
      {value ? (
        <button className="btn btn-primary btn-icon" aria-label="Ouvrir">
          <Icon name="send" />
        </button>
      ) : (
        <button type="button" className="btn btn-ghost" onClick={paste}>
          <Icon name="link" className="h-5 w-5" /> <span className="hidden sm:inline">Coller</span>
        </button>
      )}
    </form>
  );
}
