import type { TrackerState } from './types';

/**
 * Le script de suivi tourne dans CHAQUE frame (page + iframes de lecteurs). Il faut retenir
 * l'état de la frame qui porte la vraie vidéo, tout en partageant l'URL et le titre de la PAGE
 * (pas ceux de l'iframe Vidmoly). Même règle que electron/main.cjs (bestState).
 */
export class FrameAggregator {
  private frames = new Map<string, TrackerState>();

  update(frame: string, state: TrackerState): void {
    this.frames.set(frame, state);
  }

  clear(): void {
    this.frames.clear();
  }

  best(page: { url: string; title: string }): TrackerState {
    const states = [...this.frames.values()];
    const withVideo = states.filter((s) => s.hasVideo);
    const pick =
      withVideo.find((s) => !s.paused) ??
      [...withVideo].sort((a, b) => b.duration - a.duration)[0] ??
      states.find((s) => s.isTop) ?? { hasVideo: false, currentTime: 0, duration: 0, paused: true, isTop: true, url: '', title: '' };
    return {
      ...pick,
      url: page.url || pick.url,
      title: page.title || states.find((s) => s.isTop)?.title || pick.title,
      isTop: true,
    };
  }
}
