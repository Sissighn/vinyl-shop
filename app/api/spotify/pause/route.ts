import { NextResponse } from "next/server";
import { z } from "zod";
import { spotifyFetch } from "@/lib/spotify";
import { readSmallJson, spotifyError, trustedMutation } from "@/lib/spotify-http";

const pauseRequest = z.object({ deviceId: z.string().min(1).max(100) });

export async function PUT(request: Request) {
  const denied = trustedMutation(request);
  if (denied) return denied;
  const parsed = pauseRequest.safeParse(await readSmallJson(request));
  if (!parsed.success) return NextResponse.json({ error: "Invalid device" }, { status: 400 });
  const response = await spotifyFetch(`/me/player/pause?device_id=${encodeURIComponent(parsed.data.deviceId)}`, { method: "PUT" });
  if (!response?.ok) return spotifyError(response, "Could not pause Spotify playback.");
  return new NextResponse(null, { status: 204 });
}
