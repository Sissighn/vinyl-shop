export type PendingPlayback = {
  revision: number;
  until: number;
  trackUri?: string;
  playing?: boolean;
};

export function pendingPlayback(revision: number, expected: { trackUri?: string; playing?: boolean }): PendingPlayback {
  return { revision, until: Date.now() + 5_000, ...expected };
}

export function shouldApplyPlayback(
  requestRevision: number,
  currentRevision: number,
  pending: PendingPlayback | null,
  state: { track?: { uri: string } | null; isPlaying: boolean },
  now: number,
) {
  if (requestRevision !== currentRevision) return false;
  if (!pending || now >= pending.until) return true;
  if (pending.trackUri && state.track?.uri !== pending.trackUri) return false;
  if (pending.playing !== undefined && state.isPlaying !== pending.playing) return false;
  return true;
}

export function playbackPollDelay(status: number, retryAfter: string | null, failures: number, hidden: boolean) {
  if (status === 429) {
    const seconds = Number(retryAfter);
    return Number.isFinite(seconds) && seconds > 0 ? Math.min(120_000, Math.max(3_000, seconds * 1000)) : 30_000;
  }
  if (status >= 500 || status === 0) return Math.min(60_000, 3_000 * 2 ** Math.min(failures, 4));
  return hidden ? 12_000 : 3_000;
}
