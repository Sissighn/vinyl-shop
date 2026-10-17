import { NextRequest, NextResponse } from "next/server";
import { clearDesktopAuth, desktopAuthAttempt, isDesktop } from "@/lib/spotify-desktop";

export async function GET(request: NextRequest) {
  if (!isDesktop()) return NextResponse.json({ desktop: false });
  const state = request.cookies.get("spotify_oauth_state")?.value;
  if (!state) return NextResponse.json({ desktop: true, status: "idle" });
  const attempt = desktopAuthAttempt(state);
  if (!attempt) return NextResponse.json({ desktop: true, status: "expired" });
  if (attempt.error) {
    clearDesktopAuth(state);
    const response = NextResponse.json({ desktop: true, status: "error", message: attempt.error });
    response.cookies.delete("spotify_oauth_state");
    return response;
  }
  if (!attempt.tokens) return NextResponse.json({ desktop: true, status: "pending" });

  const tokens = attempt.tokens;
  clearDesktopAuth(state);
  const response = NextResponse.json({ desktop: true, status: "connected" });
  response.cookies.delete("spotify_oauth_state");
  response.cookies.set("spotify_access_token", tokens.access_token, {
    httpOnly: true, secure: false, sameSite: "lax", maxAge: tokens.expires_in, path: "/",
  });
  response.cookies.set("spotify_expires_at", String(Date.now() + tokens.expires_in * 1000), {
    httpOnly: true, secure: false, sameSite: "lax", maxAge: tokens.expires_in, path: "/",
  });
  if (tokens.refresh_token) {
    response.cookies.set("spotify_refresh_token", tokens.refresh_token, {
      httpOnly: true, secure: false, sameSite: "lax", maxAge: 60 * 60 * 24 * 30, path: "/",
    });
  }
  return response;
}
