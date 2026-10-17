import { NextResponse } from "next/server";
import { spotifyConfigured, spotifyRedirectUri, spotifyScopes } from "@/lib/spotify";
import { beginDesktopAuth, isDesktop } from "@/lib/spotify-desktop";

export async function GET(request: Request) {
  if (!spotifyConfigured()) {
    return NextResponse.redirect(new URL("/?spotify=error", request.url));
  }
  const desktop = isDesktop();
  const auth = desktop ? await beginDesktopAuth() : null;
  const state = auth?.state ?? crypto.randomUUID();
  const authorize = new URL("https://accounts.spotify.com/authorize");
  authorize.search = new URLSearchParams({
    response_type: "code",
    client_id: process.env.SPOTIFY_CLIENT_ID!,
    scope: spotifyScopes,
    redirect_uri: spotifyRedirectUri(request.url),
    state,
    ...(auth ? { code_challenge_method: "S256", code_challenge: auth.challenge } : {}),
  }).toString();

  const response = NextResponse.redirect(authorize);
  response.cookies.set("spotify_oauth_state", state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production" && !desktop,
    sameSite: "lax",
    maxAge: 600,
    path: "/",
  });
  return response;
}
