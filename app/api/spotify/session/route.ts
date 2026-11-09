import { NextResponse } from "next/server";
import { SpotifyTokenError, spotifyAccessToken } from "@/lib/spotify";

export async function GET() {
  try {
    const token = await spotifyAccessToken();
    return NextResponse.json({ connected: Boolean(token) });
  } catch (error) {
    if (error instanceof SpotifyTokenError && error.status === 401) return NextResponse.json({ connected: false });
    return NextResponse.json({ error: "Spotify connection is temporarily unavailable." }, {
      status: error instanceof SpotifyTokenError ? error.status : 503,
      headers: error instanceof SpotifyTokenError && error.retryAfter ? { "retry-after": error.retryAfter } : {},
    });
  }
}
