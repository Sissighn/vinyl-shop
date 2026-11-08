import { NextRequest, NextResponse } from "next/server";
import { trustedMutation } from "@/lib/spotify-http";
import { clearDesktopAuth } from "@/lib/spotify-desktop";

export async function POST(request: NextRequest) {
  const denied = trustedMutation(request);
  if (denied) return denied;
  const pendingState = request.cookies.get("spotify_oauth_state")?.value;
  if (pendingState) clearDesktopAuth(pendingState);
  const response = NextResponse.json({ connected: false }, { headers: { "cache-control": "no-store" } });
  for (const name of ["spotify_access_token", "spotify_expires_at", "spotify_refresh_token", "spotify_oauth_state"]) {
    response.cookies.set(name, "", { httpOnly: true, sameSite: "lax", path: "/", maxAge: 0 });
  }
  return response;
}
