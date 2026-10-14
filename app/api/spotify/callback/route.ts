import { NextRequest, NextResponse } from "next/server";
import { spotifyRedirectUri } from "@/lib/spotify";
import { desktopAuthAttempt, finishDesktopAuth, isDesktop } from "@/lib/spotify-desktop";

type TokenResponse = { access_token: string; expires_in: number; refresh_token?: string };

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const state = request.nextUrl.searchParams.get("state");
  if (isDesktop()) {
    const attempt = state ? desktopAuthAttempt(state) : null;
    if (!attempt || !state) return new Response("This Spotify sign-in has expired.", { status: 400 });
    const error = request.nextUrl.searchParams.get("error");
    if (error || !code || !process.env.SPOTIFY_CLIENT_ID) {
      finishDesktopAuth(state, { error: error ?? "Spotify sign-in was cancelled." });
      return desktopResultPage(false);
    }
    try {
      const tokenResponse = await fetch("https://accounts.spotify.com/api/token", {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type: "authorization_code",
          code,
          redirect_uri: spotifyRedirectUri(request.url),
          client_id: process.env.SPOTIFY_CLIENT_ID,
          code_verifier: attempt.verifier,
        }),
        cache: "no-store",
      });
      if (!tokenResponse.ok) throw new Error("Spotify sign-in failed.");
      finishDesktopAuth(state, { tokens: await tokenResponse.json() as TokenResponse });
      return desktopResultPage(true);
    } catch {
      finishDesktopAuth(state, { error: "Spotify sign-in failed." });
      return desktopResultPage(false);
    }
  }
  const expectedState = request.cookies.get("spotify_oauth_state")?.value;
  const clientId = process.env.SPOTIFY_CLIENT_ID;
  const clientSecret = process.env.SPOTIFY_CLIENT_SECRET;

  if (!code || !state || state !== expectedState || !clientId || !clientSecret) {
    return NextResponse.redirect(new URL("/?spotify=error", request.url));
  }

  const tokenResponse = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: {
      authorization: `Basic ${btoa(`${clientId}:${clientSecret}`)}`,
      "content-type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: spotifyRedirectUri(request.url),
    }),
    cache: "no-store",
  });

  if (!tokenResponse.ok) return NextResponse.redirect(new URL("/?spotify=error", request.url));
  const tokens = (await tokenResponse.json()) as TokenResponse;
  const response = NextResponse.redirect(new URL("/?spotify=connected", request.url));
  const secure = process.env.NODE_ENV === "production";
  response.cookies.delete("spotify_oauth_state");
  response.cookies.set("spotify_access_token", tokens.access_token, {
    httpOnly: true, secure, sameSite: "lax", maxAge: tokens.expires_in, path: "/",
  });
  response.cookies.set("spotify_expires_at", String(Date.now() + tokens.expires_in * 1000), {
    httpOnly: true, secure, sameSite: "lax", maxAge: tokens.expires_in, path: "/",
  });
  if (tokens.refresh_token) {
    response.cookies.set("spotify_refresh_token", tokens.refresh_token, {
      httpOnly: true, secure, sameSite: "lax", maxAge: 60 * 60 * 24 * 30, path: "/",
    });
  }
  return response;
}

function desktopResultPage(success: boolean) {
  const message = success
    ? "Spotify is connected. You can return to Vinyl Room and close this tab."
    : "Spotify could not be connected. Return to Vinyl Room and try again.";
  return new Response(`<!doctype html><html lang="en"><meta charset="utf-8"><title>Vinyl Room</title><body style="font:16px system-ui;background:#261a19;color:#f4e8d9;display:grid;place-items:center;min-height:90vh;text-align:center"><main><h1>Vinyl Room</h1><p>${message}</p></main></body></html>`, {
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}
