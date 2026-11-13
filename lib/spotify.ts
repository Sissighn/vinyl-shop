import { cookies } from "next/headers";
import { isDesktop } from "@/lib/spotify-desktop";

const TOKEN_ENDPOINT = "https://accounts.spotify.com/api/token";
const API_BASE = "https://api.spotify.com/v1";

type SpotifyTokenResponse = {
  access_token: string;
  expires_in: number;
  refresh_token?: string;
};

const REQUEST_TIMEOUT_MS = 8_000;
const refreshes = new Map<string, Promise<SpotifyTokenResponse>>();

export class SpotifyTokenError extends Error {
  constructor(readonly status: number, message: string, readonly retryAfter?: string | null) {
    super(message);
  }
}

function serviceResponse(status: number, error: string, retryAfter?: string | null) {
  return Response.json({ error }, {
    status,
    headers: { "cache-control": "no-store", ...(retryAfter ? { "retry-after": retryAfter } : {}) },
  });
}

export const spotifyScopes = [
  "user-modify-playback-state",
  "user-read-playback-state",
  "user-read-private",
].join(" ");

export function spotifyConfigured() {
  return Boolean(process.env.SPOTIFY_CLIENT_ID && (isDesktop() || process.env.SPOTIFY_CLIENT_SECRET));
}

export function spotifyRedirectUri(requestUrl: string) {
  return process.env.SPOTIFY_REDIRECT_URI ?? `${new URL(requestUrl).origin}/api/spotify/callback`;
}

async function exchangeRefreshToken(refreshToken: string) {
  const clientId = process.env.SPOTIFY_CLIENT_ID;
  const clientSecret = process.env.SPOTIFY_CLIENT_SECRET;
  if (!clientId || (!isDesktop() && !clientSecret)) throw new SpotifyTokenError(503, "Spotify is not configured.");

  let response: Response;
  try {
    response = await fetch(TOKEN_ENDPOINT, {
    method: "POST",
    headers: {
      ...(!isDesktop() ? { authorization: `Basic ${btoa(`${clientId}:${clientSecret}`)}` } : {}),
      "content-type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
      ...(isDesktop() ? { client_id: clientId } : {}),
    }),
    cache: "no-store",
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch {
    throw new SpotifyTokenError(503, "Spotify sign-in is temporarily unavailable.");
  }
  if (response.status === 429) throw new SpotifyTokenError(429, "Spotify is limiting requests.", response.headers.get("retry-after"));
  if (response.status === 400 || response.status === 401) throw new SpotifyTokenError(401, "Spotify sign-in expired.");
  if (!response.ok) throw new SpotifyTokenError(503, "Spotify sign-in is temporarily unavailable.");
  const token = await response.json() as Partial<SpotifyTokenResponse>;
  if (typeof token.access_token !== "string" || !Number.isFinite(token.expires_in) || !token.expires_in || token.expires_in <= 0) {
    throw new SpotifyTokenError(502, "Spotify returned an invalid token response.");
  }
  return token as SpotifyTokenResponse;
}

export async function spotifyAccessToken() {
  const cookieStore = await cookies();
  const accessToken = cookieStore.get("spotify_access_token")?.value;
  const expiresAt = Number(cookieStore.get("spotify_expires_at")?.value ?? 0);

  if (accessToken && Date.now() < expiresAt - 30_000) return accessToken;

  const refreshToken = cookieStore.get("spotify_refresh_token")?.value;
  if (!refreshToken) return null;
  let pending = refreshes.get(refreshToken);
  if (!pending) {
    pending = exchangeRefreshToken(refreshToken);
    refreshes.set(refreshToken, pending);
    void pending.finally(() => refreshes.delete(refreshToken)).catch(() => {});
  }
  let next: SpotifyTokenResponse;
  try {
    next = await pending;
  } catch (error) {
    if (error instanceof SpotifyTokenError && error.status === 401) {
      for (const name of ["spotify_access_token", "spotify_expires_at", "spotify_refresh_token"]) cookieStore.delete(name);
    }
    throw error;
  }
  const options = { httpOnly: true, sameSite: "lax" as const, secure: process.env.NODE_ENV === "production" && !isDesktop(), path: "/" };
  cookieStore.set("spotify_access_token", next.access_token, { ...options, maxAge: next.expires_in });
  cookieStore.set("spotify_expires_at", String(Date.now() + next.expires_in * 1000), { ...options, maxAge: next.expires_in });
  if (next.refresh_token) {
    cookieStore.set("spotify_refresh_token", next.refresh_token, { ...options, maxAge: 60 * 60 * 24 * 30 });
  }
  return next.access_token;
}

export async function spotifyFetch(path: string, init?: RequestInit) {
  let accessToken: string | null;
  try { accessToken = await spotifyAccessToken(); }
  catch (error) {
    if (error instanceof SpotifyTokenError) return serviceResponse(error.status, error.message, error.retryAfter);
    return serviceResponse(503, "Spotify sign-in is temporarily unavailable.");
  }
  if (!accessToken) return null;
  try {
    return await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: { ...init?.headers, authorization: `Bearer ${accessToken}` },
    cache: "no-store",
    signal: init?.signal ? AbortSignal.any([init.signal, AbortSignal.timeout(REQUEST_TIMEOUT_MS)]) : AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch {
    return serviceResponse(503, "Spotify is temporarily unavailable.");
  }
}
