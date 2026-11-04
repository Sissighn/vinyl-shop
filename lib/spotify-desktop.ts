type DesktopTokens = {
  access_token: string;
  expires_in: number;
  refresh_token?: string;
};

type AuthAttempt = {
  verifier: string;
  createdAt: number;
  tokens?: DesktopTokens;
  error?: string;
};

const stateStore = globalThis as typeof globalThis & {
  __vinylRoomSpotifyAuth?: Map<string, AuthAttempt>;
};

function attempts() {
  stateStore.__vinylRoomSpotifyAuth ??= new Map();
  const store = stateStore.__vinylRoomSpotifyAuth;
  for (const [state, attempt] of store) {
    if (Date.now() - attempt.createdAt > 10 * 60_000) store.delete(state);
  }
  return store;
}

export function isDesktop() {
  return process.env.VINYL_DESKTOP === "1";
}

export async function beginDesktopAuth() {
  const state = crypto.randomUUID();
  const verifier = Buffer.from(crypto.getRandomValues(new Uint8Array(64))).toString("base64url");
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
  const challenge = Buffer.from(digest).toString("base64url");
  attempts().set(state, { verifier, createdAt: Date.now() });
  return { state, challenge };
}

export function desktopAuthAttempt(state: string) {
  return attempts().get(state);
}

export function finishDesktopAuth(state: string, result: { tokens?: DesktopTokens; error?: string }) {
  const attempt = attempts().get(state);
  if (!attempt) return false;
  Object.assign(attempt, result);
  return true;
}

export function clearDesktopAuth(state: string) {
  attempts().delete(state);
}
