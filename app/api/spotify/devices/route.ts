import { NextResponse } from "next/server";
import { spotifyFetch } from "@/lib/spotify";

type SpotifyDevice = {
  id: string | null;
  name: string;
  type: string;
  is_active: boolean;
  is_restricted: boolean;
};

export async function GET() {
  const response = await spotifyFetch("/me/player/devices");
  if (!response) return NextResponse.json({ error: "Not connected" }, { status: 401 });
  if (!response.ok) return NextResponse.json({ error: "Could not load Spotify devices" }, { status: response.status });

  const data = (await response.json()) as { devices?: SpotifyDevice[] };
  return NextResponse.json({
    devices: (data.devices ?? []).filter((device) => Boolean(device.id)).map((device) => ({
      id: device.id,
      name: device.name,
      type: device.type,
      isActive: device.is_active,
      isRestricted: device.is_restricted,
    })),
  }, { headers: { "cache-control": "no-store" } });
}
