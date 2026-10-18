import { NextResponse } from "next/server";
import { spotifyAccessToken } from "@/lib/spotify";

export async function GET() {
  try {
    const accessToken = await spotifyAccessToken();
    if (!accessToken) return NextResponse.json({ error: "Not connected" }, { status: 401 });
    return NextResponse.json({ accessToken }, { headers: { "cache-control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "Could not refresh Spotify token" }, { status: 401 });
  }
}
