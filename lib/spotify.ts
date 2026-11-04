import { cookies } from "next/headers";
import { isDesktop } from "@/lib/spotify-desktop";

const TOKEN_ENDPOINT = "https://accounts.spotify.com/api/token";
const API_BASE = "https://api.spotify.com/v1";

type SpotifyTokenResponse = {
  access_token: string;
  expires_in: number;
  refresh_token?: string;
};

export const spotifyScopes = [
  "user-modify-playback-state",
  "user-read-playback-state",
  "user-read-email",
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
  if (!clientId || (!isDesktop() && !clientSecret)) throw new Error("Spotify is not configured");

  const response = await fetch(TOKEN_ENDPOINT, {
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
  });
  if (!response.ok) throw new Error("Could not refresh Spotify token");
  return (await response.json()) as SpotifyTokenResponse;
}

export async function spotifyAccessToken() {
  const cookieStore = await cookies();
  const accessToken = cookieStore.get("spotify_access_token")?.value;
  const expiresAt = Number(cookieStore.get("spotify_expires_at")?.value ?? 0);

  if (accessToken && Date.now() < expiresAt - 30_000) return accessToken;

  const refreshToken = cookieStore.get("spotify_refresh_token")?.value;
  if (!refreshToken) return null;
  const next = await exchangeRefreshToken(refreshToken);
  cookieStore.set("spotify_access_token", next.access_token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production" && !isDesktop(),
    maxAge: next.expires_in,
    path: "/",
  });
  cookieStore.set("spotify_expires_at", String(Date.now() + next.expires_in * 1000), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production" && !isDesktop(),
    maxAge: next.expires_in,
    path: "/",
  });
  if (next.refresh_token) {
    cookieStore.set("spotify_refresh_token", next.refresh_token, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production" && !isDesktop(),
      maxAge: 60 * 60 * 24 * 30,
      path: "/",
    });
  }
  return next.access_token;
}

export async function spotifyFetch(path: string, init?: RequestInit) {
  const accessToken = await spotifyAccessToken();
  if (!accessToken) return null;
  return fetch(`${API_BASE}${path}`, {
    ...init,
    headers: { ...init?.headers, authorization: `Bearer ${accessToken}` },
    cache: "no-store",
  });
}
