import { NextResponse } from "next/server";
import { z } from "zod";
import { spotifyFetch } from "@/lib/spotify";

const pauseRequest = z.object({ deviceId: z.string().min(1).max(100) });

export async function PUT(request: Request) {
  const parsed = pauseRequest.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: "Invalid device" }, { status: 400 });
  const response = await spotifyFetch(`/me/player/pause?device_id=${encodeURIComponent(parsed.data.deviceId)}`, { method: "PUT" });
  if (!response) return NextResponse.json({ error: "Not connected" }, { status: 401 });
  if (!response.ok) return NextResponse.json({ error: "Could not pause playback" }, { status: response.status });
  return new NextResponse(null, { status: 204 });
}
