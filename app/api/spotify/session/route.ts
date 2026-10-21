import { NextResponse } from "next/server";
import { spotifyAccessToken } from "@/lib/spotify";

export async function GET() {
  try {
    const token = await spotifyAccessToken();
    return NextResponse.json({ connected: Boolean(token) });
  } catch {
    return NextResponse.json({ connected: false });
  }
}
